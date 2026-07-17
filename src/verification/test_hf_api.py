"""Test HF Inference API with InferenceClient"""
import os
os.environ["HF_TOKEN"] = "YOUR_HF_TOKEN_HERE"

from huggingface_hub import InferenceClient
from pathlib import Path

client = InferenceClient(
    provider="hf-inference",
    api_key=os.environ["HF_TOKEN"],
)

test_images = [
    ("simulated_real.jpg", "模拟真实照片"),
    ("simulated_ai.jpg", "模拟AI生成"),
]

base = Path(__file__).parent / "test_images"

for img_name, label in test_images:
    img_path = base / img_name
    if not img_path.exists():
        print(f"  ✗ {label}: 文件不存在 {img_path}")
        continue

    print(f"\n  📤 测试: {label} ({img_name})")
    try:
        result = client.image_classification(
            str(img_path),
            model="Ateeqq/ai-vs-human-image-detector"
        )
        print(f"  ✓ API 调用成功!")
        for item in result:
            print(f"    {item.label}: {item.score:.4f} ({item.score*100:.1f}%)")
        
        # 找到最高分
        top = max(result, key=lambda x: x.score)
        verdict = "AI 生成" if top.label == "ai" else "真实照片"
        print(f"    → 判定: {verdict} (置信度 {top.score*100:.1f}%)")
    except Exception as e:
        print(f"  ✗ 调用失败: {type(e).__name__}: {e}")
