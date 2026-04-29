CLEAR_TEST_CASES = [
    {"name": "red_clear", "rgb": [230, 40, 40], "expected": "red"},
    {"name": "green_clear", "rgb": [50, 180, 70], "expected": "green"},
    {"name": "blue_clear", "rgb": [40, 90, 220], "expected": "blue"},
    {"name": "yellow_clear", "rgb": [240, 220, 60], "expected": "yellow"},
    {"name": "orange_clear", "rgb": [245, 150, 40], "expected": "orange"},
    {"name": "pink_clear", "rgb": [240, 130, 180], "expected": "pink"},
    {"name": "purple_clear", "rgb": [120, 60, 150], "expected": "purple"},
    {"name": "brown_clear", "rgb": [150, 90, 60], "expected": "brown"},
    {"name": "black_clear", "rgb": [20, 20, 20], "expected": "black"},
    {"name": "grey_clear", "rgb": [128, 128, 128], "expected": "grey"},
    {"name": "white_clear", "rgb": [245, 245, 245], "expected": "white"},
]

HARD_TEST_CASES = [
    {"name": "navy_ambiguous", "rgb": [15, 35, 85], "expected": "blue"},
    {"name": "rose_ambiguous", "rgb": [220, 120, 160], "expected": "pink"},
    {"name": "violet_ambiguous", "rgb": [95, 60, 145], "expected": "purple"},
    {"name": "olive_ambiguous", "rgb": [145, 145, 40], "expected": "green"},
    {"name": "beige_ambiguous", "rgb": [220, 200, 170], "expected": "brown"},
    {"name": "dark_purple_ambiguous", "rgb": [70, 30, 80], "expected": "purple"},
]

ALL_TEST_CASES = CLEAR_TEST_CASES + HARD_TEST_CASES