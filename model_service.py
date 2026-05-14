from __future__ import annotations

import csv
import math
import random
from collections import Counter, defaultdict
from typing import Callable

from test_cases import ALL_TEST_CASES

DATASET_PATH = "final_data_colors.csv"
TEST_SIZE = 0.2
RANDOM_STATE = 42
K_NEIGHBORS = 5

METRIC_CONFIGS = {
    "euclidean": {"display_name": "euclidean", "p": 2},
    "manhattan": {"display_name": "manhattan", "p": 1},
    "chebyshev": {"display_name": "chebyshev", "p": None},
    "minkowski_p3": {"display_name": "minkowski", "p": 3},
}


def rgb_to_hex(rgb: list[int] | list[float]) -> str:
    return "#{:02x}{:02x}{:02x}".format(int(rgb[0]), int(rgb[1]), int(rgb[2]))


def normalize_rgb(rgb: list[int]) -> list[int]:
    if len(rgb) != 3:
        raise ValueError("RGB phai co dung 3 gia tri")

    output: list[int] = []
    for value in rgb:
        value = int(value)
        if value < 0 or value > 255:
            raise ValueError("moi gia tri RGB phai trong khoang 0..255")
        output.append(value)
    return output


def euclidean_distance(a: list[float], b: list[float]) -> float:
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def manhattan_distance(a: list[float], b: list[float]) -> float:
    return sum(abs(x - y) for x, y in zip(a, b))


def chebyshev_distance(a: list[float], b: list[float]) -> float:
    return max(abs(x - y) for x, y in zip(a, b))


def minkowski_distance(a: list[float], b: list[float], p: int = 3) -> float:
    return sum(abs(x - y) ** p for x, y in zip(a, b)) ** (1 / p)


def get_distance_function(metric_name: str) -> Callable[[list[float], list[float]], float]:
    if metric_name == "euclidean":
        return euclidean_distance
    if metric_name == "manhattan":
        return manhattan_distance
    if metric_name == "chebyshev":
        return chebyshev_distance
    if metric_name == "minkowski_p3":
        return lambda a, b: minkowski_distance(a, b, p=3)
    raise ValueError(f"Metric khong hop le: {metric_name}")


class ManualKNNClassifier:

    def __init__(self, n_neighbors: int = 5, metric_name: str = "euclidean"):
        if n_neighbors < 1:
            raise ValueError("n_neighbors phai >= 1")
        if metric_name not in METRIC_CONFIGS:
            raise ValueError(f"Metric khong hop le: {metric_name}")

        self.n_neighbors = int(n_neighbors)
        self.metric_name = metric_name
        self.distance_func = get_distance_function(metric_name)
        self.X_train: list[list[float]] = []
        self.y_train: list[str] = []

    def fit(self, X_train: list[list[float]], y_train: list[str]) -> None:
        if len(X_train) != len(y_train):
            raise ValueError("X_train va y_train phai co cung so luong mau")
        if not X_train:
            raise ValueError("Tap train dang rong")
        if self.n_neighbors > len(X_train):
            raise ValueError("n_neighbors lon hon so luong mau training")

        self.X_train = [list(map(float, row)) for row in X_train]
        self.y_train = [str(label) for label in y_train]

    def kneighbors(self, rgb: list[int] | list[float], n_neighbors: int | None = None) -> list[dict]:
        if not self.X_train:
            raise RuntimeError("Model chua duoc fit")

        used_k = int(n_neighbors or self.n_neighbors)
        if used_k < 1:
            raise ValueError("k phai >= 1")
        if used_k > len(self.X_train):
            raise ValueError("k lon hon so luong mau training")

        query = list(map(float, rgb))
        distances: list[tuple[float, int]] = []

        for index, train_rgb in enumerate(self.X_train):
            distance = self.distance_func(query, train_rgb)
            distances.append((distance, index))

        distances.sort(key=lambda item: (item[0], item[1]))

        return [
            {"distance": distance, "index": index}
            for distance, index in distances[:used_k]
        ]

    def _vote(self, neighbors: list[dict]) -> str:

        stats: dict[str, dict[str, float]] = {}

        for item in neighbors:
            index = int(item["index"])
            distance = float(item["distance"])
            label = self.y_train[index]

            if label not in stats:
                stats[label] = {
                    "count": 0,
                    "total_distance": 0.0,
                    "nearest_distance": distance,
                }

            stats[label]["count"] += 1
            stats[label]["total_distance"] += distance
            stats[label]["nearest_distance"] = min(stats[label]["nearest_distance"], distance)

        winner = min(
            stats.items(),
            key=lambda item: (
                -item[1]["count"],
                item[1]["total_distance"] / item[1]["count"],
                item[1]["nearest_distance"],
                item[0],
            ),
        )
        return winner[0]

    def predict_one(self, rgb: list[int] | list[float]) -> str:
        neighbors = self.kneighbors(rgb, self.n_neighbors)
        return self._vote(neighbors)

    def predict(self, X: list[list[int]] | list[list[float]]) -> list[str]:
        return [self.predict_one(row) for row in X]


def stratified_train_test_split(
    X: list[list[float]],
    y: list[str],
    test_size: float = TEST_SIZE,
    random_state: int = RANDOM_STATE,
) -> tuple[list[list[float]], list[list[float]], list[str], list[str]]:
    if len(X) != len(y):
        raise ValueError("X va y phai co cung so luong mau")
    if not 0 < test_size < 0.5:
        raise ValueError("test_size phai > 0 va < 0.5")

    rng = random.Random(random_state)
    label_to_indices: dict[str, list[int]] = defaultdict(list)

    for index, label in enumerate(y):
        label_to_indices[label].append(index)

    train_indices: list[int] = []
    test_indices: list[int] = []

    for label in sorted(label_to_indices):
        indices = label_to_indices[label][:]
        rng.shuffle(indices)
        if len(indices) == 1:
            train_indices.extend(indices)
            continue

        n_test = round(len(indices) * test_size)
        n_test = max(1, int(n_test))
        n_test = min(n_test, len(indices) - 1)

        test_indices.extend(indices[:n_test])
        train_indices.extend(indices[n_test:])

    if not train_indices:
        raise ValueError("Khong tao duoc tap train")
    if not test_indices:
        raise ValueError("Khong tao duoc tap test. Moi label can co it nhat 2 mau de stratify")

    rng.shuffle(train_indices)
    rng.shuffle(test_indices)

    X_train = [X[i] for i in train_indices]
    X_test = [X[i] for i in test_indices]
    y_train = [y[i] for i in train_indices]
    y_test = [y[i] for i in test_indices]

    return X_train, X_test, y_train, y_test


def accuracy_score_manual(y_true: list[str], y_pred: list[str]) -> float:
    if len(y_true) != len(y_pred):
        raise ValueError("y_true va y_pred phai co cung so luong")
    if not y_true:
        return 0.0
    correct = sum(1 for true, pred in zip(y_true, y_pred) if true == pred)
    return correct / len(y_true)


def precision_recall_f1_for_label(
    y_true: list[str],
    y_pred: list[str],
    label: str,
) -> dict:
    tp = sum(1 for true, pred in zip(y_true, y_pred) if true == label and pred == label)
    fp = sum(1 for true, pred in zip(y_true, y_pred) if true != label and pred == label)
    fn = sum(1 for true, pred in zip(y_true, y_pred) if true == label and pred != label)
    support = sum(1 for true in y_true if true == label)

    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0

    return {
        "precision": precision,
        "recall": recall,
        "f1-score": f1,
        "support": support,
    }


def f1_score_macro_manual(y_true: list[str], y_pred: list[str]) -> float:
    labels = sorted(set(y_true) | set(y_pred))
    if not labels:
        return 0.0
    f1_values = [precision_recall_f1_for_label(y_true, y_pred, label)["f1-score"] for label in labels]
    return sum(f1_values) / len(f1_values)


def classification_report_manual(y_true: list[str], y_pred: list[str]) -> dict:
    labels = sorted(set(y_true) | set(y_pred))
    report: dict = {}

    for label in labels:
        scores = precision_recall_f1_for_label(y_true, y_pred, label)
        report[label] = {
            "precision": round(float(scores["precision"]), 4),
            "recall": round(float(scores["recall"]), 4),
            "f1-score": round(float(scores["f1-score"]), 4),
            "support": int(scores["support"]),
        }

    total_support = len(y_true)
    accuracy = accuracy_score_manual(y_true, y_pred)

    if labels:
        macro_precision = sum(report[label]["precision"] for label in labels) / len(labels)
        macro_recall = sum(report[label]["recall"] for label in labels) / len(labels)
        macro_f1 = sum(report[label]["f1-score"] for label in labels) / len(labels)
    else:
        macro_precision = macro_recall = macro_f1 = 0.0

    if total_support:
        weighted_precision = sum(report[label]["precision"] * report[label]["support"] for label in labels) / total_support
        weighted_recall = sum(report[label]["recall"] * report[label]["support"] for label in labels) / total_support
        weighted_f1 = sum(report[label]["f1-score"] * report[label]["support"] for label in labels) / total_support
    else:
        weighted_precision = weighted_recall = weighted_f1 = 0.0

    report["accuracy"] = round(float(accuracy), 4)
    report["macro avg"] = {
        "precision": round(float(macro_precision), 4),
        "recall": round(float(macro_recall), 4),
        "f1-score": round(float(macro_f1), 4),
        "support": int(total_support),
    }
    report["weighted avg"] = {
        "precision": round(float(weighted_precision), 4),
        "recall": round(float(weighted_recall), 4),
        "f1-score": round(float(weighted_f1), 4),
        "support": int(total_support),
    }

    return report


class ColorModelService:
    def __init__(self, csv_path: str = DATASET_PATH):
        self.csv_path = csv_path
        self.rows: list[dict] = []
        self.X: list[list[float]] = []
        self.y: list[str] = []
        self.X_train: list[list[float]] = []
        self.X_test: list[list[float]] = []
        self.y_train: list[str] = []
        self.y_test: list[str] = []
        self.models: dict[str, ManualKNNClassifier] = {}
        self.metric_results: list[dict] = []
        self.best_metric_name: str | None = None
        self.k_neighbors = K_NEIGHBORS
        self.test_size = TEST_SIZE
        self.random_state = RANDOM_STATE

    def load_dataset(self) -> None:
        required_columns = {"red", "green", "blue", "label"}
        rows: list[dict] = []
        X: list[list[float]] = []
        y: list[str] = []

        with open(self.csv_path, mode="r", encoding="utf-8-sig", newline="") as file:
            reader = csv.DictReader(file)
            fieldnames = set(reader.fieldnames or [])
            missing = required_columns.difference(fieldnames)
            if missing:
                raise ValueError(f"Dataset thieu cot: {', '.join(sorted(missing))}")

            for line_number, row in enumerate(reader, start=2):
                try:
                    red = int(float(row["red"]))
                    green = int(float(row["green"]))
                    blue = int(float(row["blue"]))
                except (TypeError, ValueError) as exc:
                    raise ValueError(f"Dong {line_number}: RGB khong hop le") from exc

                rgb = normalize_rgb([red, green, blue])
                label = str(row["label"]).strip().lower()
                if not label:
                    raise ValueError(f"Dong {line_number}: label dang rong")

                rows.append({"red": rgb[0], "green": rgb[1], "blue": rgb[2], "label": label})
                X.append([float(rgb[0]), float(rgb[1]), float(rgb[2])])
                y.append(label)

        if not rows:
            raise ValueError("Dataset dang rong")

        self.rows = rows
        self.X = X
        self.y = y

    def split_dataset(self) -> None:
        if not self.X or not self.y:
            raise RuntimeError("Dataset chua duoc load")

        self.X_train, self.X_test, self.y_train, self.y_test = stratified_train_test_split(
            self.X,
            self.y,
            test_size=self.test_size,
            random_state=self.random_state,
        )

    def build_model(self, metric_name: str) -> ManualKNNClassifier:
        if metric_name not in METRIC_CONFIGS:
            raise ValueError(f"Metric khong hop le: {metric_name}")

        return ManualKNNClassifier(
            n_neighbors=self.k_neighbors,
            metric_name=metric_name,
        )

    def train_all(self) -> None:
        if not self.X_train or not self.y_train:
            raise RuntimeError("Train set chua san sang")

        self.metric_results = []
        self.models = {}

        for metric_name in METRIC_CONFIGS:
            model = self.build_model(metric_name)
            model.fit(self.X_train, self.y_train)

            y_pred = model.predict(self.X_test)
            acc = accuracy_score_manual(self.y_test, y_pred)
            macro_f1 = f1_score_macro_manual(self.y_test, y_pred)

            self.models[metric_name] = model
            self.metric_results.append(
                {
                    "metric_name": metric_name,
                    "accuracy": round(float(acc), 4),
                    "macro_f1": round(float(macro_f1), 4),
                }
            )

        best = max(self.metric_results, key=lambda x: (x["macro_f1"], x["accuracy"]))
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
            "k_neighbors": self.k_neighbors,
            "test_size": self.test_size,
            "random_state": self.random_state,
            "metrics": list(METRIC_CONFIGS.keys()),
            "recommended_metric": self.best_metric_name,
        }

    def get_summary(self) -> dict:
        if not self.metric_results:
            raise RuntimeError("Model chua duoc khoi tao")

        best = max(self.metric_results, key=lambda x: (x["macro_f1"], x["accuracy"]))
        label_counts = dict(Counter(self.y))

        return {
            "dataset": {
                "rows": int(len(self.rows)),
                "labels": label_counts,
            },
            "config": self.get_config(),
            "results": self.metric_results,
            "recommended_metric": best,
        }

    def predict_one(self, rgb: list[int], metric_name: str | None = None) -> dict:
        rgb = normalize_rgb(rgb)
        used_metric = self._resolve_metric(metric_name)

        pred = self.models[used_metric].predict_one(rgb)

        return {
            "rgb": rgb,
            "hex": rgb_to_hex(rgb),
            "predicted_label": str(pred),
            "used_metric": used_metric,
            "recommended_metric": self.best_metric_name,
        }

    def predict_all_metrics(self, rgb: list[int]) -> dict:
        rgb = normalize_rgb(rgb)
        predictions: dict[str, str] = {}

        for metric_name, model in self.models.items():
            predictions[metric_name] = str(model.predict_one(rgb))

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
        used_k = int(k or self.k_neighbors)

        if used_k < 1:
            raise ValueError("k phai >= 1")
        if used_k > len(self.X_train):
            raise ValueError("k lon hon so luong mau training")

        model = self.models[used_metric]
        nearest_items = model.kneighbors(rgb, n_neighbors=used_k)

        neighbors = []
        for rank, item in enumerate(nearest_items, start=1):
            index = int(item["index"])
            distance = float(item["distance"])
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
            pred = model.predict_one(rgb)

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

        report = classification_report_manual(self.y_test, y_pred)

        return {
            "used_metric": used_metric,
            "recommended_metric": self.best_metric_name,
            "report": report,
        }

    def retrain(
        self,
        k_neighbors: int | None = None,
        test_size: float | None = None,
        random_state: int | None = None,
    ) -> dict:
        if k_neighbors is not None:
            if k_neighbors < 1 or k_neighbors > 50:
                raise ValueError("k_neighbors phai trong khoang 1..50")
            self.k_neighbors = int(k_neighbors)

        if test_size is not None:
            if test_size <= 0 or test_size >= 0.5:
                raise ValueError("test_size phai > 0 va < 0.5")
            self.test_size = float(test_size)

        if random_state is not None:
            if random_state < 0:
                raise ValueError("random_state phai >= 0")
            self.random_state = int(random_state)

        self.split_dataset()

        if self.k_neighbors > len(self.X_train):
            raise ValueError("k_neighbors lon hon so luong mau training")

        self.train_all()

        return {
            "message": "Model retrained successfully",
            "config": self.get_config(),
            "summary": self.get_summary(),
        }
