from __future__ import annotations

import numpy as np
import pandas as pd

from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsClassifier

from test_cases import ALL_TEST_CASES

DATASET_PATH = "final_data_colors.csv"
TEST_SIZE = 0.2
RANDOM_STATE = 42
K_NEIGHBORS = 5

METRIC_CONFIGS = {
    "euclidean": ("euclidean", {}),
    "manhattan": ("manhattan", {}),
    "chebyshev": ("chebyshev", {}),
    "minkowski_p3": ("minkowski", {"p": 3}),
}


def rgb_to_hex(rgb: list[int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(int(rgb[0]), int(rgb[1]), int(rgb[2]))


def normalize_rgb(rgb: list[int]) -> list[int]:
    if len(rgb) != 3:
        raise ValueError("RGB phai co dung 3 gia tri")
    output = []
    for value in rgb:
        if value < 0 or value > 255:
            raise ValueError("moi gia tri RGB phai trong khoang 0..255")
        output.append(int(value))
    return output


class ColorModelService:
    def __init__(self, csv_path: str = DATASET_PATH):
        self.csv_path = csv_path
        self.df: pd.DataFrame | None = None
        self.X: np.ndarray | None = None
        self.y: np.ndarray | None = None
        self.X_train: np.ndarray | None = None
        self.X_test: np.ndarray | None = None
        self.y_train: np.ndarray | None = None
        self.y_test: np.ndarray | None = None
        self.models: dict[str, KNeighborsClassifier] = {}
        self.metric_results: list[dict] = []
        self.best_metric_name: str | None = None

    def load_dataset(self) -> None:
        df = pd.read_csv(self.csv_path)
        required_columns = {"red", "green", "blue", "label"}
        missing = required_columns.difference(df.columns)
        if missing:
            raise ValueError(f"Dataset thieu cot: {', '.join(sorted(missing))}")

        df["label"] = df["label"].astype(str).str.strip().str.lower()
        self.df = df
        self.X = df[["red", "green", "blue"]].astype(float).values
        self.y = df["label"].values

    def split_dataset(self) -> None:
        if self.X is None or self.y is None:
            raise RuntimeError("Dataset chua duoc load")
        self.X_train, self.X_test, self.y_train, self.y_test = train_test_split(
            self.X,
            self.y,
            test_size=TEST_SIZE,
            random_state=RANDOM_STATE,
            stratify=self.y,
        )

    def build_model(self, metric_name: str) -> KNeighborsClassifier:
        if metric_name not in METRIC_CONFIGS:
            raise ValueError(f"Metric khong hop le: {metric_name}")

        metric, extra_params = METRIC_CONFIGS[metric_name]
        return KNeighborsClassifier(
            n_neighbors=K_NEIGHBORS,
            metric=metric,
            **extra_params,
        )

    def train_all(self) -> None:
        if self.X_train is None or self.y_train is None:
            raise RuntimeError("Train set chua san sang")

        self.metric_results = []
        self.models = {}

        for metric_name in METRIC_CONFIGS:
            model = self.build_model(metric_name)
            model.fit(self.X_train, self.y_train)

            y_pred = model.predict(self.X_test)
            acc = accuracy_score(self.y_test, y_pred)
            macro_f1 = f1_score(self.y_test, y_pred, average="macro")

            self.models[metric_name] = model
            self.metric_results.append(
                {
                    "metric_name": metric_name,
                    "accuracy": round(float(acc), 4),
                    "macro_f1": round(float(macro_f1), 4),
                }
            )

        best = max(self.metric_results, key=lambda x: (x["accuracy"], x["macro_f1"]))
        self.best_metric_name = best["metric_name"]

    def initialize(self) -> None:
        self.load_dataset()
        self.split_dataset()
        self.train_all()

    def _resolve_metric(self, metric_name: str | None = None) -> str:
        used_metric = metric_name or self.best_metric_name
        if not used_metric or used_metric not in self.models:
            raise ValueError(f"Metric khong hop le: {used_metric}")
        return used_metric

    def get_config(self) -> dict:
        return {
            "k_neighbors": K_NEIGHBORS,
            "test_size": TEST_SIZE,
            "random_state": RANDOM_STATE,
            "metrics": list(METRIC_CONFIGS.keys()),
            "recommended_metric": self.best_metric_name,
        }

    def get_summary(self) -> dict:
        if not self.metric_results:
            raise RuntimeError("Model chua duoc khoi tao")

        best = max(self.metric_results, key=lambda x: (x["accuracy"], x["macro_f1"]))
        label_counts = self.df["label"].value_counts().to_dict() if self.df is not None else {}

        return {
            "dataset": {
                "rows": int(len(self.df)) if self.df is not None else 0,
                "labels": label_counts,
            },
            "config": self.get_config(),
            "results": self.metric_results,
            "recommended_metric": best,
        }

    def predict_one(self, rgb: list[int], metric_name: str | None = None) -> dict:
        rgb = normalize_rgb(rgb)
        used_metric = self._resolve_metric(metric_name)

        rgb_arr = np.array(rgb, dtype=float).reshape(1, -1)
        pred = self.models[used_metric].predict(rgb_arr)[0]

        return {
            "rgb": rgb,
            "hex": rgb_to_hex(rgb),
            "predicted_label": str(pred),
            "used_metric": used_metric,
            "recommended_metric": self.best_metric_name,
        }

    def predict_all_metrics(self, rgb: list[int]) -> dict:
        rgb = normalize_rgb(rgb)
        rgb_arr = np.array(rgb, dtype=float).reshape(1, -1)
        predictions = {}

        for metric_name, model in self.models.items():
            predictions[metric_name] = str(model.predict(rgb_arr)[0])

        return {
            "rgb": rgb,
            "hex": rgb_to_hex(rgb),
            "predictions": predictions,
            "recommended_metric": self.best_metric_name,
            "recommended_prediction": predictions[self.best_metric_name],
        }

    def get_neighbors(
        self,
        rgb: list[int],
        metric_name: str | None = None,
        k: int | None = None,
    ) -> dict:
        rgb = normalize_rgb(rgb)
        used_metric = self._resolve_metric(metric_name)
        used_k = int(k or K_NEIGHBORS)

        if used_k < 1:
            raise ValueError("k phai >= 1")
        if used_k > len(self.X_train):
            raise ValueError("k lon hon so luong mau training")

        model = self.models[used_metric]
        rgb_arr = np.array(rgb, dtype=float).reshape(1, -1)
        distances, indices = model.kneighbors(rgb_arr, n_neighbors=used_k)

        neighbors = []
        for rank, (distance, index) in enumerate(zip(distances[0], indices[0]), start=1):
            item_rgb = [int(x) for x in self.X_train[index]]
            neighbors.append(
                {
                    "rank": rank,
                    "rgb": item_rgb,
                    "hex": rgb_to_hex(item_rgb),
                    "label": str(self.y_train[index]),
                    "distance": round(float(distance), 4),
                }
            )

        return {
            "query": {"rgb": rgb, "hex": rgb_to_hex(rgb)},
            "used_metric": used_metric,
            "k": used_k,
            "neighbors": neighbors,
        }

    def run_test_cases(self, metric_name: str | None = None) -> dict:
        used_metric = self._resolve_metric(metric_name)
        model = self.models[used_metric]
        outputs = []

        for case in ALL_TEST_CASES:
            rgb = normalize_rgb(case["rgb"])
            rgb_arr = np.array(rgb, dtype=float).reshape(1, -1)
            pred = model.predict(rgb_arr)[0]

            outputs.append(
                {
                    "name": case["name"],
                    "rgb": rgb,
                    "hex": rgb_to_hex(rgb),
                    "expected": case["expected"],
                    "predicted": str(pred),
                    "is_correct": str(pred) == str(case["expected"]),
                }
            )

        total = len(outputs)
        correct = sum(1 for x in outputs if x["is_correct"])

        return {
            "used_metric": used_metric,
            "recommended_metric": self.best_metric_name,
            "summary": {
                "total_cases": total,
                "correct_cases": correct,
                "accuracy_on_manual_cases": round(correct / total, 4) if total else 0,
            },
            "cases": outputs,
        }

    def get_classification_report(self, metric_name: str | None = None) -> dict:
        used_metric = self._resolve_metric(metric_name)
        model = self.models[used_metric]
        y_pred = model.predict(self.X_test)

        report = classification_report(
            self.y_test,
            y_pred,
            output_dict=True,
            zero_division=0,
        )

        return {
            "used_metric": used_metric,
            "recommended_metric": self.best_metric_name,
            "report": report,
        }
