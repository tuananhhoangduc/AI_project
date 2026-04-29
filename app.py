from contextlib import asynccontextmanager
from enum import Enum

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from model_service import ColorModelService
from test_cases import ALL_TEST_CASES


class MetricName(str, Enum):
    euclidean = "euclidean"
    manhattan = "manhattan"
    chebyshev = "chebyshev"
    minkowski_p3 = "minkowski_p3"


service = ColorModelService()


@asynccontextmanager
async def lifespan(app: FastAPI):
    service.initialize()
    yield


app = FastAPI(
    title="Color Classification API",
    version="1.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # deploy thi doi lai origin FE
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve frontend static files from the `public` directory
app.mount("/static", StaticFiles(directory="public"), name="public")


@app.get("/")
def index():
    return FileResponse("public/index.html")


class PredictRequest(BaseModel):
    rgb: list[int] = Field(..., min_length=3, max_length=3)
    metric: MetricName | None = None

    @field_validator("rgb")
    @classmethod
    def validate_rgb(cls, value):
        if len(value) != 3:
            raise ValueError("rgb phai co 3 phan tu")
        for x in value:
            if x < 0 or x > 255:
                raise ValueError("moi gia tri rgb phai trong khoang 0..255")
        return value


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/config")
def get_config():
    return service.get_config()


@app.get("/api/model/summary")
def get_model_summary():
    return service.get_summary()


@app.get("/api/test-cases")
def get_test_cases():
    return {"cases": ALL_TEST_CASES}


@app.get("/api/test-cases/run")
def run_test_cases(metric: MetricName | None = None):
    try:
        return service.run_test_cases(metric.value if metric else None)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/report")
def get_report(metric: MetricName | None = None):
    try:
        return service.get_classification_report(metric.value if metric else None)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/predict")
def predict_color(payload: PredictRequest):
    try:
        return service.predict_one(
            rgb=payload.rgb,
            metric_name=payload.metric.value if payload.metric else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/predict/all")
def predict_all(payload: PredictRequest):
    try:
        return service.predict_all_metrics(payload.rgb)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))