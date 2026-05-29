const prisma = require('../lib/prisma');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const logger = require('../lib/logger');

const isProd = process.env.NODE_ENV === 'production';
const SESSION_COOKIE = 'ibshi_session';
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8h, khớp JWT_EXPIRES_IN mặc định

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    maxAge: SESSION_MAX_AGE_MS,
    path: '/',
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    path: '/',
  });
}

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res
        .status(400)
        .json({ success: false, message: 'Vui lòng cung cấp Username và Mật khẩu.' });
    }

    // SECURITY: Chỉ tìm user đã tồn tại — KHÔNG tự động tạo tài khoản
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      // Trả về cùng message để tránh username enumeration attack
      return res.status(401).json({ success: false, message: 'Sai thông tin đăng nhập.' });
    }

    // Kiểm tra tài khoản có bị khóa không
    if (user.isActive === false) {
      return res
        .status(403)
        .json({ success: false, message: 'Tài khoản đã bị vô hiệu hóa. Liên hệ Admin.' });
    }

    // Validate password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Sai thông tin đăng nhập.' });
    }

    // Bắt buộc phải có JWT_SECRET trong môi trường — không fallback hardcode
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      (req.log || logger).error('JWT_SECRET chưa được cấu hình trong .env!');
      return res.status(500).json({ success: false, message: 'Lỗi cấu hình server.' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, name: user.name },
      jwtSecret,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    // Audit trail
    await prisma.auditLog.create({
      data: {
        action: 'LOGIN',
        userId: user.id,
        entityType: 'User',
        entityId: user.id,
        details: JSON.stringify({
          ip: req.ip,
          agent: req.headers['user-agent']?.substring(0, 200),
        }),
      },
    });

    // S2-1: Set HttpOnly Secure cookie (primary) + return token in body (legacy clients).
    // Khi FE migrate xong, có thể bỏ field `token` khỏi response.
    setSessionCookie(res, token);

    res.status(200).json({
      success: true,
      token,
      user: { id: user.id, name: user.name, username: user.username, role: user.role },
    });
  } catch (error) {
    (req.log || logger).error({ err: error, op: 'login' }, 'Login failed');
    res.status(500).json({ success: false, message: 'Lỗi hệ thống.' });
  }
};

exports.logout = async (req, res) => {
  try {
    clearSessionCookie(res);
    // Audit khi có req.user (đã verify ở route), không lỗi nếu không có
    if (req.user?.id) {
      await prisma.auditLog
        .create({
          data: {
            action: 'LOGOUT',
            userId: req.user.id,
            entityType: 'User',
            entityId: req.user.id,
            details: JSON.stringify({ ip: req.ip }),
          },
        })
        .catch(() => undefined);
    }
    res.status(200).json({ success: true, message: 'Đã đăng xuất.' });
  } catch (error) {
    (req.log || logger).error({ err: error, op: 'logout' }, 'Logout failed');
    res.status(500).json({ success: false, message: 'Lỗi hệ thống.' });
  }
};

exports.me = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, username: true, role: true, dept: true, isActive: true },
    });
    if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy user' });
    if (!user.isActive)
      return res.status(403).json({ success: false, message: 'Tài khoản bị vô hiệu hóa.' });
    res.status(200).json({ success: true, user });
  } catch (error) {
    (req.log || logger).error({ err: error, op: 'me' }, 'Get me failed');
    res.status(500).json({ success: false, message: 'Lỗi hệ thống.' });
  }
};

// User tự đổi mật khẩu
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ success: false, message: 'Vui lòng cung cấp mật khẩu hiện tại và mới.' });
    }
    if (newPassword.length < 8) {
      return res
        .status(400)
        .json({ success: false, message: 'Mật khẩu mới phải có ít nhất 8 ký tự.' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy user.' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Mật khẩu hiện tại không đúng.' });
    }

    // Không cho đặt lại cùng mật khẩu
    const isSame = await bcrypt.compare(newPassword, user.password);
    if (isSame) {
      return res
        .status(400)
        .json({ success: false, message: 'Mật khẩu mới phải khác mật khẩu cũ.' });
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });

    await prisma.auditLog.create({
      data: {
        action: 'CHANGE_PASSWORD',
        userId: user.id,
        entityType: 'User',
        entityId: user.id,
        details: JSON.stringify({ ip: req.ip }),
      },
    });

    res.status(200).json({ success: true, message: 'Đã đổi mật khẩu thành công.' });
  } catch (error) {
    (req.log || logger).error({ err: error, op: 'changePassword' }, 'Change password failed');
    res.status(500).json({ success: false, message: 'Lỗi hệ thống.' });
  }
};

// Admin: Tạo user mới (chỉ ADMIN mới được gọi endpoint này)
exports.createUser = async (req, res) => {
  try {
    const { username, password, name, role, dept } = req.body;
    if (!username || !password || !name || !role) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin bắt buộc: username, password, name, role.',
      });
    }

    const VALID_ROLES = ['MUA_HANG', 'KY_THUAT', 'QC', 'WAREHOUSE', 'BOD', 'ADMIN'];
    if (!VALID_ROLES.includes(role)) {
      return res
        .status(400)
        .json({ success: false, message: `Role không hợp lệ. Chọn: ${VALID_ROLES.join(', ')}` });
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Username đã tồn tại.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Mật khẩu phải có ít nhất 8 ký tự.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { username, password: hashedPassword, name, role, dept: dept || null, isActive: true },
    });

    await prisma.auditLog.create({
      data: {
        action: 'CREATE_USER',
        userId: req.user.id,
        entityType: 'User',
        entityId: user.id,
        details: JSON.stringify({ newUsername: username, role }),
      },
    });

    res.status(201).json({
      success: true,
      message: `Đã tạo tài khoản ${username} với quyền ${role}.`,
      user: { id: user.id, username: user.username, name: user.name, role: user.role },
    });
  } catch (error) {
    (req.log || logger).error({ err: error, op: 'createUser' }, 'Create user failed');
    res.status(500).json({ success: false, message: 'Lỗi hệ thống.' });
  }
};
