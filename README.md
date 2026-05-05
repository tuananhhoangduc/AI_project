# Color Classifier - KNN Color Detection

## Giới thiệu

**Color Classifier** phân loại màu ảnh bằng thuật toán **K-Nearest Neighbors (KNN)**. Người dùng tải ảnh lên, chọn điểm màu, hệ thống trả về nhãn màu (`red`, `green`, `blue`, `yellow`, `orange`, `pink`, `purple`, `brown`, `black`, `grey`, `white`) và so sánh kết quả giữa nhiều độ đo khoảng cách.

---

## Công nghệ

Python · FastAPI · Uvicorn · Pandas · NumPy · Scikit-learn · HTML/CSS/JS

---

## Thuật toán KNN

Mỗi màu là một điểm `(R, G, B)` trong không gian 3D. Khi dự đoán, chương trình tìm `K` điểm gần nhất trong tập train và chọn nhãn xuất hiện nhiều nhất.

**Các độ đo hỗ trợ:** `euclidean` · `manhattan` · `chebyshev` · `minkowski_p3`

Sau khi train, hệ thống tự chọn **recommended metric** tốt nhất.

---

## Cài đặt & Chạy

```powershell
# 1. Tạo và kích hoạt môi trường ảo
python -m venv .venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1

# 2. Cài thư viện
pip install -r requirements.txt

# 3. Chạy server
python -m uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

Truy cập: `http://127.0.0.1:8000/` · Tài liệu API: `http://127.0.0.1:8000/docs`

---

## API chính

| Endpoint | Method | Mô tả |
|---|---|---|
| `/api/health` | GET | Kiểm tra server |
| `/api/config` | GET | Cấu hình model |
| `/api/model/summary` | GET | Tổng quan model & đánh giá metrics |
| `/api/predict` | POST | Dự đoán màu từ RGB |
| `/api/predict/all` | POST | Dự đoán bằng tất cả metrics |
| `/api/predict/neighbors` | POST | Xem K hàng xóm gần nhất |
| `/api/test-cases/run` | GET | Chạy test case thủ công |
| `/api/report` | GET | Classification report |
| `/api/model/retrain` | POST | Retrain với cấu hình mới |

**Ví dụ dự đoán:**
```json
POST /api/predict
{ "rgb": [230, 40, 40] }
→ { "predicted_label": "red", "used_metric": "chebyshev" }
```

---

## Lỗi thường gặp

| Lỗi | Giải pháp |
|---|---|
| Không chạy được `.ps1` | `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` |
| Không tìm thấy dataset | Đặt `final_data_colors.csv` cùng cấp với `app.py` |
| Trang web không load | Kiểm tra thư mục `public/index.html` |
| Port 8000 bị chiếm | Đổi sang `--port 8001` |
