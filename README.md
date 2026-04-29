# Color Classifier (KNN)

Chuong trinh phan loai mau anh su dung K-Nearest Neighbors. Giao dien web cho phep tai anh, lay bang mau va goi API de du doan nhan mau.

## Cai dat va chay (Windows PowerShell)

```powershell
# Mo PowerShell va chuyen den thu muc du an (noi co file app.py)
cd <duong_dan_toi_thu_muc_du_an>
python -m venv venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

## Su dung

- Mo trinh duyet: http://127.0.0.1:8000/
- API docs: http://127.0.0.1:8000/docs
