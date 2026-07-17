"""
TrueLens 水印去除对抗测试
测试目标：去掉 AI 图片水印后，HF ViT 模型是否仍能检测出 AI 生成
"""

import os
os.environ["HF_TOKEN"] = "YOUR_HF_TOKEN_HERE"

from pathlib import Path
from PIL import Image
from huggingface_hub import InferenceClient

PROJECT = Path(__file__).parent.parent.parent
IMAGE_DIR = PROJECT / "generated-images"
OUTPUT_DIR = Path(__file__).parent / "watermark_test_results"
OUTPUT_DIR.mkdir(exist_ok=True)

hf_client = InferenceClient(
    provider="hf-inference",
    api_key=os.environ["HF_TOKEN"],
)

MODEL = "Ateeqq/ai-vs-human-image-detector"

def remove_watermark(img_path, output_path):
    """裁掉底部 10% 去除右下角水印"""
    img = Image.open(img_path)
    w, h = img.size
    cropped = img.crop((0, 0, w, int(h * 0.90)))
    cropped.save(output_path)
    return output_path

def detect_image(img_path):
    """用 InferenceClient 调用 HF ViT"""
    result = hf_client.image_classification(str(img_path), model=MODEL)
    scores = {}
    for item in result:
        scores[item.label] = round(item.score, 4)
    return scores

def get_exif_info(img_path):
    try:
        img = Image.open(img_path)
        exif = img._getexif()
        if exif:
            return {"has_exif": True, "fields": len(exif)}
        return {"has_exif": False, "fields": 0}
    except:
        return {"has_exif": False, "fields": 0}

test_cases = [
    ("beach.png", "海边照"),
    ("mountain.png", "山上照"),
]

results = []

for filename, label in test_cases:
    original_path = IMAGE_DIR / filename
    if not original_path.exists():
        print(f"  [SKIP] {filename} 不存在")
        continue
    
    base_name = filename.rsplit(".", 1)[0]
    no_wm_path = OUTPUT_DIR / f"{base_name}_no_watermark.png"
    remove_watermark(original_path, no_wm_path)
    
    print(f"\n{'='*60}")
    print(f"测试: {label} ({filename})")
    print(f"{'='*60}")
    
    print(f"  [1/4] 检测原图（有水印）...")
    original_scores = detect_image(original_path)
    print(f"        AI概率={original_scores.get('ai', 'N/A')}  真实概率={original_scores.get('hum', 'N/A')}")
    
    print(f"  [2/4] 检测去水印版...")
    no_wm_scores = detect_image(no_wm_path)
    print(f"        AI概率={no_wm_scores.get('ai', 'N/A')}  真实概率={no_wm_scores.get('hum', 'N/A')}")
    
    print(f"  [3/4] EXIF 分析...")
    original_exif = get_exif_info(original_path)
    no_wm_exif = get_exif_info(no_wm_path)
    print(f"        原图 EXIF: {original_exif}")
    print(f"        去水印 EXIF: {no_wm_exif}")
    
    orig_ai = original_scores.get("ai", 0)
    nowm_ai = no_wm_scores.get("ai", 0)
    
    print(f"\n  [4/4] 对比总结:")
    print(f"        有水印 AI 概率: {orig_ai*100:.2f}%")
    print(f"        去水印 AI 概率: {nowm_ai*100:.2f}%")
    
    diff = abs(orig_ai - nowm_ai)
    verdict = "✓ 仍可检测为 AI" if nowm_ai > 0.5 else "✗ 误判为真实照片"
    print(f"        分数变化: {diff*100:.2f}%")
    print(f"        结论: {verdict}")
    
    results.append({
        "label": label,
        "filename": filename,
        "with_watermark": {"ai_score": orig_ai, "scores": original_scores, "exif": original_exif},
        "without_watermark": {"ai_score": nowm_ai, "scores": no_wm_scores, "exif": no_wm_exif},
        "no_watermark_file": str(no_wm_path),
    })

# Save report
import json
report_path = OUTPUT_DIR / "watermark_test_report.json"
with open(report_path, "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

print(f"\n{'='*60}")
print(f"完整报告: {report_path}")
print(f"去水印图片: {OUTPUT_DIR}")
