"""
Download real photos and test HF ViT model accuracy
Uses httpx (installed with huggingface_hub) which works in this environment
"""
import os
os.environ["HF_TOKEN"] = "YOUR_HF_TOKEN_HERE"

import httpx
from pathlib import Path
from huggingface_hub import InferenceClient

test_dir = Path(__file__).parent / "test_images"

# ============================================================
# 1. Download real photos from Lorem Picsum
# ============================================================
print("=" * 60)
print("下载真实照片 (Lorem Picsum)")
print("=" * 60)

client_http = httpx.Client(timeout=30, verify=True)

for i in range(1, 4):
    img_path = test_dir / f"real_photo_{i}.jpg"
    try:
        # Lorem Picsum provides real photographs
        resp = client_http.get(f"https://picsum.photos/800/600", follow_redirects=True)
        resp.raise_for_status()
        img_path.write_bytes(resp.content)
        print(f"  ✓ real_photo_{i}.jpg ({len(resp.content)} bytes)")
    except Exception as e:
        print(f"  ✗ real_photo_{i}.jpg 下载失败: {e}")

# Also try downloading from Unsplash source
for i in range(4, 7):
    img_path = test_dir / f"real_photo_{i}.jpg"
    try:
        resp = client_http.get(
            f"https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800",
            follow_redirects=True
        )
        resp.raise_for_status()
        img_path.write_bytes(resp.content)
        print(f"  ✓ real_photo_{i}.jpg ({len(resp.content)} bytes)")
    except Exception as e:
        print(f"  ✗ real_photo_{i}.jpg 下载失败: {e}")

client_http.close()

# ============================================================
# 2. Test all images with HF ViT model
# ============================================================
print("\n" + "=" * 60)
print("HF ViT 模型准确率测试")
print("=" * 60)

hf_client = InferenceClient(
    provider="hf-inference",
    api_key=os.environ["HF_TOKEN"],
)

# Test real photos
print("\n📸 真实照片测试:")
real_correct = 0
real_total = 0
for img_file in sorted(test_dir.glob("real_photo_*.jpg")):
    real_total += 1
    try:
        result = hf_client.image_classification(
            str(img_file),
            model="Ateeqq/ai-vs-human-image-detector"
        )
        top = max(result, key=lambda x: x.score)
        is_correct = top.label == "hum"  # 真实照片应该判定为 hum
        if is_correct:
            real_correct += 1
        status = "✓ 正确" if is_correct else "✗ 误判"
        print(f"  {status} {img_file.name}: {top.label} ({top.score*100:.1f}%) | ai={result[0].score*100:.1f}% hum={result[1].score*100:.1f}%")
    except Exception as e:
        print(f"  ✗ {img_file.name}: 调用失败 - {e}")

# Test the old simulated images (both are actually synthetic)
print("\n🤖 合成图片测试 (PIL纯色方块):")
for img_file in sorted(test_dir.glob("simulated_*.jpg")):
    try:
        result = hf_client.image_classification(
            str(img_file),
            model="Ateeqq/ai-vs-human-image-detector"
        )
        top = max(result, key=lambda x: x.score)
        print(f"  → {img_file.name}: {top.label} ({top.score*100:.1f}%) | ai={result[0].score*100:.1f}% hum={result[1].score*100:.1f}%")
    except Exception as e:
        print(f"  ✗ {img_file.name}: 调用失败 - {e}")

# ============================================================
# 3. Summary
# ============================================================
print("\n" + "=" * 60)
print("准确率汇总")
print("=" * 60)

if real_total > 0:
    real_accuracy = real_correct / real_total * 100
    print(f"  真实照片识别率: {real_correct}/{real_total} = {real_accuracy:.1f}%")
    print(f"  (模型应判定为 'hum')")
else:
    print("  ⚠ 无真实照片测试数据")

print(f"\n  注: 需要补充 AI 生成图片测试才能计算完整准确率")
print(f"  建议用 ImageGen 生成 3-5 张 AI 图片进行对比测试")
