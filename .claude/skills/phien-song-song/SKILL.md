---
name: phien-song-song
description: Điều phối nhiều phiên Claude làm việc song song trên CÙNG một workspace / kho git — chống ghi đè, trùng việc, dẫm chân nhau. Dùng skill này BẤT CỨ KHI NÀO có dấu hiệu nhiều phiên cùng chạy: người dùng nhắc "session khác", "phiên kia", "chạy song song", "nhiều session", tên một phiên cụ thể (CPVT, OCRP, DA, "Code vật tư"), hoặc bảo bạn viết prompt giao việc cho phiên khác. Cũng dùng khi TỰ PHÁT HIỆN dấu vết phiên khác: có thay đổi chưa commit mà mình không tạo ra, số liệu đổi giữa hai lần đo, file bị sửa bất ngờ, commit lạ trong git log, bản ghi mới trong nhật ký kiểm toán không phải do mình. Và dùng TRƯỚC khi làm bất cứ việc gì có tác dụng phụ toàn cục — đổi schema, thêm ràng buộc cơ sở dữ liệu, khởi động lại máy chủ, sửa biến môi trường, chạy script làm sạch dữ liệu.
---

# Nhiều phiên làm việc song song trên cùng một workspace

Giao thức `_sessions/PROTOCOL.md` của dự án lo việc **nhiều phiên ở nhiều workspace khác nhau**
nhắn tin cho nhau. Skill này lo tình huống khác hẳn và nguy hiểm hơn: **hai phiên trở lên cùng
đứng trong MỘT workspace, MỘT kho git, MỘT cơ sở dữ liệu, cùng lúc.** Ở đó không có hộp thư nào
cứu được — hai phiên ghi vào cùng một chỗ là mất dữ liệu ngay.

## Vì sao khó hơn vẻ ngoài

Phản xạ đầu tiên là nghĩ "chia file ra là xong". Không đủ. Trạng thái dùng chung có **bốn tầng**,
và ba tầng dưới không nhìn thấy trong `git status`:

| Tầng | Ví dụ | Điều gì hỏng nếu không phân chia |
|---|---|---|
| 1. File và git | mã nguồn, tài liệu, sổ thay đổi | ghi đè lẫn nhau, mất việc chưa commit |
| 2. Cơ sở dữ liệu | bảng, bản ghi, mốc số liệu | phiên A đo mốc, phiên B ghi vào giữa → phép so vô nghĩa |
| 3. Tiến trình đang chạy | máy chủ API, giao diện, cơ sở dữ liệu | phiên A sửa code, máy chủ của phiên B chưa nạp lại |
| 4. Tác dụng phụ toàn cục | ràng buộc, schema, biến môi trường, chốt an toàn | phiên A chặn một thao tác để thử, phiên B tưởng hệ thống hỏng |

Một phiên cẩn thận vẫn phá được việc của phiên kia mà **không hề chạm vào file nào của họ** — chỉ
cần ghi một bản ghi vào cơ sở dữ liệu đúng lúc phiên kia đang đo.

## Mở đầu: bốn câu hỏi trước khi gõ phím

Làm trước khi sửa bất cứ thứ gì. Rẻ, và cứu được cả buổi.

```bash
git status --short                    # có gì chưa commit? của ai?
git log --oneline -5 --date=relative  # có commit nào mình không nhớ đã tạo?
```

1. **Có thay đổi chưa commit không, và có phải của mình không?** Thấy file lạ đang sửa dở → **giả
   định đó là của phiên khác**. Đừng `git checkout`, đừng `git stash`, đừng `git reset`. Hỏi trước.
2. **Có phiên nào khác đang chạy không?** Người dùng thường không nói. Dấu hiệu: commit mới hơn
   lần mình đo, tiến trình máy chủ khởi động ở thời điểm mình không biết, bản ghi mới trong nhật ký
   kiểm toán.
3. **Việc mình sắp làm chạm tới tầng nào?** Nếu chạm tầng 2, 3 hoặc 4 → phải báo trước, không tự làm.
4. **Nếu mình làm hỏng, ai chịu?** Dữ liệu thật của người khác thì luôn phải có đường lùi trước khi động.

## Phân vùng sở hữu — viết ra, đừng ngầm hiểu

Khi hai phiên chia việc, viết thẳng bảng này vào prompt của phiên kia. Ngầm hiểu là nguồn gốc
của mọi lần dẫm chân.

| Vùng | Phiên nào sửa |
|---|---|
| `backend/src/**`, `frontend/src/**`, `prisma/**` | phiên viết code |
| `deploy/uat/**`, tài liệu kiểm thử | phiên kiểm thử |
| `docs/<tài liệu cụ thể>.md` | phiên tạo ra nó |
| sổ thay đổi dùng chung | **cả hai — xem luật riêng bên dưới** |

Nguyên tắc chọn ranh giới: **cắt theo thư mục, đừng cắt theo file lẻ trong cùng thư mục.** Hai phiên
cùng sửa hai file cạnh nhau thì sớm muộn cũng có người sửa nhầm file bên kia.

### File dùng chung (sổ thay đổi, ghi chú vận hành)

Không tránh được — luật của dự án bắt mọi phiên phải ghi sổ. Nên đặt luật *chỉ thêm, không sửa*:

- Chỉ **thêm mục mới**, không bao giờ sửa hay xoá mục của phiên khác.
- Trước khi ghi, **đọc lại file** — phiên kia có thể vừa thêm gì đó sau lần bạn đọc trước.
- Thấy nội dung lạ trong file → đó là phiên kia vừa ghi. **Giữ nguyên.**
- Tuyệt đối không `git checkout` file dùng chung để "cho sạch".

Khi giao việc cho phiên khác, nói thẳng trong prompt: *"File X đang có thay đổi CHƯA COMMIT của phiên
khác — thêm bên dưới, đừng ghi đè, đừng checkout."*

## Cơ sở dữ liệu là tài nguyên dùng chung

Đây là tầng hay bị quên nhất, vì `git status` không thấy gì.

- **Mốc số liệu hỏng rất nhanh.** Đo mốc rồi đi làm việc khác 20 phút, quay lại so — con số đã đổi
  vì phiên kia (hoặc chính người dùng đang bấm trên trình duyệt) vừa ghi vào. **Đo lại ngay trước
  khi so, đừng tin số đo cũ.**
- **Chênh lệch không giải thích được thì HỎI, đừng tự sửa số.** Truy nguồn trước: nhật ký kiểm toán
  thường ghi ai làm, lúc nào, đổi từ gì sang gì. Có phiên bản "trước → sau" thì mới biết đó là việc
  thật hay dư âm phiên thử.
- **Ảnh chụp nguyên trạng phải bao đúng phạm vi mình sẽ đụng.** Chụp thiếu thì lúc khôi phục sẽ
  không đưa được về mốc, và tệ hơn là không biết mình đã chụp thiếu.
- **Đừng khôi phục dữ liệu người khác vừa tạo.** Thấy bản ghi lạ trong vùng mình định dọn → hỏi đó
  là việc thật hay bấm thử, rồi mới quyết.

## Tiến trình đang chạy không thuộc về bạn

Máy chủ thường do người dùng khởi động trong tab riêng.

- Sửa code xong **không có nghĩa là hệ thống đã đổi.** Kiểm xem tiến trình có tự nạp lại không
  (`--watch`); nếu không thì bản vá chỉ nằm trên đĩa.
- **Xác nhận bản vá đã sống bằng bằng chứng từ hệ thống đang chạy**, không phải bằng nội dung file.
  Ví dụ: đọc header máy chủ thật sự trả về, chứ không phải đọc lại dòng code vừa sửa.
- Cần khởi động lại thì **đưa lệnh cho người dùng và chờ**, đừng tự chạy. Đừng kết luận "đã xong"
  khi chưa thấy dấu hiệu tiến trình mới lên.

## Tác dụng phụ toàn cục — nêu rõ phạm vi trước khi làm

Chốt an toàn, ràng buộc tạm, biến môi trường, cờ tính năng: những thứ này **ảnh hưởng mọi người**,
không riêng phiên đặt ra.

Trước khi đặt, trả lời được ba câu:
1. Nó chặn/đổi những gì, và với **ai** — chỉ mình, hay cả hệ thống?
2. Ai sẽ gặp nó mà không hiểu vì sao?
3. Gỡ bằng cách nào, và nếu phiên này chết giữa chừng thì ai gỡ?

Rồi **nói rõ với người dùng trước khi đặt, và nhắc lại khi còn treo.** Một ràng buộc chặn tạo đơn
hàng để thử nghiệm sẽ khiến người dùng thật tưởng hệ thống hỏng.

Đặt xong thì **tự thử xem nó có thật sự có tác dụng không** — chốt an toàn không cắn còn nguy hiểm
hơn không có chốt, vì nó tạo cảm giác an toàn giả.

## Khi giao việc cho phiên khác

Prompt giao việc tốt cần có, ngoài nội dung công việc:

1. **Bảng phân vùng sở hữu** — vùng nào được sửa, vùng nào cấm.
2. **Cảnh báo file đang sửa dở** — file nào có thay đổi chưa commit của ai.
3. **Mốc dữ liệu hiện tại** — để phiên kia biết thế nào là "không làm hỏng gì".
4. **Những quyết định cần người dùng chốt trước khi code** — để phiên kia không đoán rồi làm lại.
5. **Danh sách những thứ đã kiểm và ĐẠT** — để phiên kia không sửa nhầm thứ đang chạy tốt.

Điểm 5 hay bị bỏ sót nhưng rất đáng giá: phiên nhận việc không có bối cảnh của bạn, rất dễ "tiện tay
sửa" một chỗ trông có vẻ sai mà thật ra đã được kiểm rồi.

## Kết phiên

- Nêu rõ **những gì còn treo**: chốt an toàn chưa gỡ, bảng tạm chưa dọn, dữ liệu chưa về mốc,
  máy chủ cần khởi động lại.
- Nêu rõ **những gì mình đã đụng vào** mà phiên khác cần biết.
- Chưa commit thì nói chưa commit. Chưa push thì nói chưa push.
- Đừng dọn dẹp thứ mình không chắc là của mình.

## Dấu hiệu đang dẫm chân nhau

Gặp một trong những cái này thì dừng lại và xác minh, đừng đi tiếp:

- Số liệu đổi giữa hai lần đo mà mình không ghi gì vào giữa.
- `git status` có file mình không nhớ đã sửa.
- Thao tác vừa nãy chạy được, giờ báo lỗi mà code không đổi.
- Nhật ký kiểm toán có bản ghi đúng khoảng thời gian mình làm việc nhưng không phải việc của mình.
- Bản vá đã ghi vào file nhưng hệ thống vẫn hành xử như cũ.
- Bảng hoặc ràng buộc lạ trong cơ sở dữ liệu, tên có dấu vết ngày tháng.
