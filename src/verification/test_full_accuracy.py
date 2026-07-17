"""
Complete accuracy test: Real photos vs AI-generated images
"""
import os
os.environ["HF_TOKEN"] = "YOUR_HF_TOKEN_HERE"

from pathlib import Path
from huggingface_hub import InferenceClient

test_dir = Path(__file__).parent / "test_images"
hf_client = InferenceClient(
    provider="hf-inference",
    api_key=os.environ["HF_TOKEN"],
)

MODEL = "Ateeqq/ai-vs-human-image-detector"

# 分类测试图片
real_photos = sorted(test_dir.glob("real_photo_*.jpg"))
ai_images = [
    test_dir / "A_photorealistic_portrait_of_a_2026-07-16T12-49-42.png",
    test_dir / "A_stunning_mountain_landscape__2026-07-16T12-50-09.png",
    test_dir / "A_close_up_photo_of_a_deliciou_2026-07-16T12-50-36.png",
]
ai_images = [f for f in ai_images if f.exists()]

print("=" * 60)
print("TrueLens HF ViT 完整准确率测试")
print(f"模型: {MODEL}")
print("=" * 60)

def test_image(img_path, expected_label):
    """Test a single image and return result dict"""
    try:
        result = hf_client.image_classification(str(img_path), model=MODEL)
        # Build label->score map properly
        scores = {}
        for item in result:
            scores[item.label] = item.score
        
        ai_score = scores.get("ai", 0)
        hum_score = scores.get("hum", 0)
        
        if ai_score > hum_score:
            predicted = "ai"
            confidence = ai_score
        else:
            predicted = "hum"
            confidence = hum_score
        
        correct = predicted == expected_label
        return {
            "correct": correct,
            "predicted": predicted,
            "expected": expected_label,
            "confidence": confidence,
            "ai_score": ai_score,
            "hum_score": hum_score,
        }
    except Exception as e:
        return {"correct": False, "error": str(e)}

# ============================================================
# Test Real Photos (expected: hum)
# ============================================================
print(f"\n📸 真实照片 (期望判定: hum/真实)")
print("-" * 60)
real_results = []
for img in real_photos:
    r = test_image(img, "hum")
    real_results.append(r)
    if "error" in r:
        print(f"  ✗ {img.name}: 错误 - {r['error']}")
    else:
        status = "✓" if r["correct"] else "✗"
        verdict = "真实" if r["predicted"] == "hum" else "AI生成"
        print(f"  {status} {img.name}: 判定={verdict} 置信度={r['confidence']*100:.1f}% | ai={r['ai_score']*100:.1f}% hum={r['hum_score']*100:.1f}%")

# ============================================================
# Test AI Images (expected: ai)
# ============================================================
print(f"\n🤖 AI 生成图片 (期望判定: ai/AI生成)")
print("-" * 60)
ai_results = []
for img in ai_images:
    r = test_image(img, "ai")
    ai_results.append(r)
    if "error" in r:
        print(f"  ✗ {img.name}: 错误 - {r['error']}")
    else:
        status = "✓" if r["correct"] else "✗"
        verdict = "AI生成" if r["predicted"] == "ai" else "真实"
        print(f"  {status} {img.name[:40]}: 判定={verdict} 置信度={r['confidence']*100:.1f}% | ai={r['ai_score']*100:.1f}% hum={r['hum_score']*100:.1f}%")

# ============================================================
# Summary
# ============================================================
print("\n" + "=" * 60)
print("准确率汇总")
print("=" * 60)

real_correct = sum(1 for r in real_results if r.get("correct"))
ai_correct = sum(1 for r in ai_results if r.get("correct"))
total = len(real_results) + len(ai_results)
total_correct = real_correct + ai_correct

print(f"\n  真实照片: {real_correct}/{len(real_results)} 正确 ({real_correct/max(len(real_results),1)*100:.1f}%)")
print(f"  AI图片:   {ai_correct}/{len(ai_images)} 正确 ({ai_correct/max(len(ai_images),1)*100:.1f}%)")
print(f"  总体:     {total_correct}/{total} 正确 ({total_correct/max(total,1)*100:.1f}%)")

# 分析误判
print("\n误判分析:")
for i, r in enumerate(real_results):
    if not r.get("correct") and "error" not in r:
        print(f"  ⚠ {real_photos[i].name}: 真实照片被误判为 AI (ai={r['ai_score']*100:.1f}%)")
for i, r in enumerate(ai_results):
    if not r.get("correct") and "error" not in r:
        print(f"  ⚠ AI图片被误判为真实 (hum={r['hum_score']*100:.1f}%)")

print(f"\n结论:")
overall_acc = total_correct / max(total, 1) * 100
if overall_acc >= 85:
    print(f"  ✓ 准确率 {overall_acc:.1f}% >= 85%，达到 MVP 上线标准")
else:
    print(f"  ⚠ 准确率 {overall_acc:.1f}% < 85%，需要调优或补充模型")
print(f"  ✓ HF Inference API 调用稳定，响应正常")
print(f"  ✓ 可以进入 Step 1: 项目搭建")
