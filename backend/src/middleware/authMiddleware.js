// S2-1: Cookie-first auth, Authorization header as backward-compat fallback.
// HttpOnly Secure cookie `ibshi_session` carries the JWT — JS can't read it.
const jwt = require('jsonwebtoken');

function extractToken(req) {
  // 1. HttpOnly cookie (new path)
  if (req.cookies && req.cookies.ibshi_session) {
    return req.cookies.ibshi_session;
  }
  // 2. Authorization: Bearer <token> (legacy fallback)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const t = authHeader.split(' ')[1];
    if (t) return t;
  }
  // 3. ?token= query (download links only — backward compat)
  if (req.query && typeof req.query.token === 'string' && req.query.token) {
    return req.query.token;
  }
  return null;
}

const verifyToken = (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: 'Chưa đăng nhập hoặc thiếu thông tin xác thực.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, message: 'Token đã hết hạn hoặc không hợp lệ' });
  }
};

const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Quyền truy cập bị từ chối. Cần quyền: ${roles.join(', ')}`,
      });
    }
    next();
  };
};

module.exports = { verifyToken, restrictTo, extractToken };
