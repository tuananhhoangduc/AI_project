from __future__ import annotations

import pandas as pd
import numpy as np

from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.metrics import accuracy_score, f1_score, classification_report

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
    return "#{:02x}{:02x}{:02x}".format(rgb[0], rgb[1], rgb[2])


class ColorModelService:
    def __init__(self, csv_path: str = DATASET_PATH):
        self.csv_path = csv_path
        self.df: pd.DataFrame | None = None
        self.X = None
        self.y = None
        self.X_train = None
        self.X_test = None
        self.y_train = None
        self.y_test = None

        self.models: dict[str, KNeighborsClassifier] = {}
        self.metric_results: list[dict] = []
        self.best_metric_name: str | None = None

    def load_dataset(self) -> None:
        df = pd.read_csv(self.csv_path)
        df["label"] = df["label"].astype(str).str.strip().str.lower()

        self.df = df
        self.X = df[["red", "green", "blue"]].values
        self.y = df["label"].values

    def split_dataset(self) -> None:
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
        self.metric_results = []
        self.models = {}

        for metric_name in METRIC_CONFIGS.keys():
            model = self.build_model(metric_name)
            model.fit(self.X_train, self.y_train)

            y_pred = model.predict(self.X_test)
            acc = accuracy_score(self.y_test, y_pred)
            macro_f1 = f1_score(self.y_test, y_pred, average="macro")

            self.models[metric_name] = model
            self.metric_results.append({
                "metric_name": metric_name,
                "accuracy": float(acc),
                "macro_f1": float(macro_f1),
            })

        best = max(self.metric_results, key=lambda x: (x["accuracy"], x["macro_f1"]))
        self.best_metric_name = best["metric_name"]

    def initialize(self) -> None:
        self.load_dataset()
        self.split_dataset()
        self.train_all()

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
        if len(rgb) != 3:
            raise ValueError("RGB phai co dung 3 gia tri")

        used_metric = metric_name or self.best_metric_name
        if used_metric not in self.models:
            raise ValueError(f"Metric khong hop le: {used_metric}")

        rgb_arr = np.array(rgb, dtype=float).reshape(1, -1)
        pred = self.models[used_metric].predict(rgb_arr)[0]

        return {
            "rgb": [int(x) for x in rgb],
            "hex": rgb_to_hex(rgb),
            "predicted_label": str(pred),
            "used_metric": used_metric,
            "recommended_metric": self.best_metric_name,
        }

    def predict_all_metrics(self, rgb: list[int]) -> dict:
        if len(rgb) != 3:
            raise ValueError("RGB phai co dung 3 gia tri")

        rgb_arr = np.array(rgb, dtype=float).reshape(1, -1)
        predictions = {}

        for metric_name, model in self.models.items():
            predictions[metric_name] = str(model.predict(rgb_arr)[0])

        return {
            "rgb": [int(x) for x in rgb],
            "hex": rgb_to_hex(rgb),
            "predictions": predictions,
            "recommended_metric": self.best_metric_name,
            "recommended_prediction": predictions[self.best_metric_name],
        }

    def run_test_cases(self, metric_name: str | None = None) -> dict:
        used_metric = metric_name or self.best_metric_name
        if used_metric not in self.models:
            raise ValueError(f"Metric khong hop le: {used_metric}")

        model = self.models[used_metric]
        outputs = []

        for case in ALL_TEST_CASES:
            rgb_arr = np.array(case["rgb"], dtype=float).reshape(1, -1)
            pred = model.predict(rgb_arr)[0]

            outputs.append({
                "name": case["name"],
                "rgb": case["rgb"],
                "hex": rgb_to_hex(case["rgb"]),
                "expected": case["expected"],
                "predicted": str(pred),
                "is_correct": str(pred) == str(case["expected"]),
            })

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
        used_metric = metric_name or self.best_metric_name
        if used_metric not in self.models:
            raise ValueError(f"Metric khong hop le: {used_metric}")

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