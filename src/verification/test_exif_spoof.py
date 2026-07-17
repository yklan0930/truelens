"""
TrueLens EXIF 伪造对抗测试
测试目标：给 AI 生成图片注入真实相机的 EXIF 元数据，看 HF ViT 能否识破
"""

import os
os.environ["HF_TOKEN"] = "YOUR_HF_TOKEN_HERE"

from pathlib import Path
from PIL import Image
from PIL.ExifTags import TAGS
import piexif
from huggingface_hub import InferenceClient
import json

PROJECT = Path(__file__).parent.parent.parent
IMAGE_DIR = PROJECT / "generated-images"
OUTPUT_DIR = Path(__file__).parent / "exif_spoof_test_results"
OUTPUT_DIR.mkdir(exist_ok=True)

hf_client = InferenceClient(
    provider="hf-inference",
    api_key=os.environ["HF_TOKEN"],
)
MODEL = "Ateeqq/ai-vs-human-image-detector"

# ============================================================
# 模拟真实 iPhone 13 Pro 拍摄的 EXIF 数据
# ============================================================
def create_fake_exif():
    """创建一套看起来非常真实的 iPhone 13 Pro EXIF 数据"""
    # GPS: 上海陆家嘴
    gps_ifd = {
        piexif.GPSIFD.GPSVersionID: (2, 3, 0, 0),
        piexif.GPSIFD.GPSLatitudeRef: b'N',
        piexif.GPSIFD.GPSLatitude: [(31, 1), (14, 1), (0, 1)],
        piexif.GPSIFD.GPSLongitudeRef: b'E',
        piexif.GPSIFD.GPSLongitude: [(121, 1), (29, 1), (0, 1)],
        piexif.GPSIFD.GPSAltitudeRef: 0,
        piexif.GPSIFD.GPSAltitude: (10, 1),
        piexif.GPSIFD.GPSTimeStamp: [(9, 1), (30, 1), (0, 1)],
        piexif.GPSIFD.GPSDateStamp: b'2025:07:15',
    }
    
    # Exif IFD: 相机拍摄参数
    exif_ifd = {
        piexif.ExifIFD.ExposureTime: (1, 120),        # 快门 1/120s
        piexif.ExifIFD.FNumber: (18, 10),              # 光圈 f/1.8
        piexif.ExifIFD.ExposureProgram: 2,              # Normal program
        piexif.ExifIFD.ISOSpeedRatings: 50,             # ISO 50
        piexif.ExifIFD.DateTimeOriginal: b'2025:07:15 09:30:00',
        piexif.ExifIFD.DateTimeDigitized: b'2025:07:15 09:30:00',
        piexif.ExifIFD.ShutterSpeedValue: (7, 1),
        piexif.ExifIFD.ApertureValue: (17, 10),
        piexif.ExifIFD.BrightnessValue: (85, 10),
        piexif.ExifIFD.ExposureBiasValue: (0, 1),
        piexif.ExifIFD.MaxApertureValue: (17, 10),
        piexif.ExifIFD.MeteringMode: 5,
        piexif.ExifIFD.Flash: 16,                       # Flash off
        piexif.ExifIFD.FocalLength: (53, 10),           # 5.3mm
        piexif.ExifIFD.PixelXDimension: 4032,
        piexif.ExifIFD.PixelYDimension: 3024,
        piexif.ExifIFD.ExposureMode: 0,
        piexif.ExifIFD.WhiteBalance: 0,
        piexif.ExifIFD.FocalLengthIn35mmFilm: 26,
        piexif.ExifIFD.LensSpecification: [(53, 10), (53, 10), (18, 10), (18, 10)],
        piexif.ExifIFD.LensMake: b'Apple',
        piexif.ExifIFD.LensModel: b'iPhone 13 Pro back triple camera 5.3mm f/1.8',
    }
    
    # 0th IFD: 基础信息
    zeroth_ifd = {
        piexif.ImageIFD.Make: b'Apple',
        piexif.ImageIFD.Model: b'iPhone 13 Pro',
        piexif.ImageIFD.Orientation: 6,
        piexif.ImageIFD.XResolution: (72, 1),
        piexif.ImageIFD.YResolution: (72, 1),
        piexif.ImageIFD.ResolutionUnit: 2,
        piexif.ImageIFD.Software: b'17.5.1',           # iOS version
        piexif.ImageIFD.DateTime: b'2025:07:15 09:30:00',
        piexif.ImageIFD.HostComputer: b'iPhone 13 Pro',
    }
    
    exif_dict = {
        "0th": zeroth_ifd,
        "Exif": exif_ifd,
        "GPS": gps_ifd,
        "1st": {},
        "thumbnail": None,
    }
    
    return piexif.dump(exif_dict)

def inject_fake_exif(img_path, output_path):
    """给图片注入伪造的真实相机 EXIF"""
    img = Image.open(img_path).convert("RGB")
    
    # 保存为 JPEG 并注入 EXIF
    exif_bytes = create_fake_exif()
    img.save(output_path, "JPEG", quality=95, exif=exif_bytes)
    return output_path

def detect_image(img_path):
    """调用 HF ViT 检测"""
    result = hf_client.image_classification(str(img_path), model=MODEL)
    scores = {}
    for item in result:
        scores[item.label] = round(item.score, 4)
    return scores

def read_exif_summary(img_path):
    """读取 EXIF 摘要"""
    try:
        img = Image.open(img_path)
        exif = img._getexif()
        if not exif:
            return {"has_exif": False, "fields": 0}
        
        summary = {"has_exif": True, "fields": len(exif)}
        # 提取关键字段
        key_names = {v: k for k, v in TAGS.items()}
        important = ["Make", "Model", "DateTime", "GPSInfo", "Software"]
        for tag_id, value in exif.items():
            name = key_names.get(tag_id, f"Tag_{tag_id}")
            if name in important:
                summary[name] = str(value)[:80]
        return summary
    except Exception as e:
        return {"has_exif": False, "error": str(e)}

# ============================================================
# 执行测试
# ============================================================
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
    spoofed_path = OUTPUT_DIR / f"{base_name}_fake_exif.jpg"
    
    print(f"\n{'='*70}")
    print(f"测试: {label} ({filename})")
    print(f"{'='*70}")
    
    # 注入伪造 EXIF
    print(f"  [1/5] 注入伪造 EXIF（iPhone 13 Pro, 上海陆家嘴 GPS, ISO 50...）")
    inject_fake_exif(original_path, spoofed_path)
    print(f"        保存到: {spoofed_path.name}")
    
    # 验证 EXIF 是否真的注入成功
    print(f"  [2/5] 验证 EXIF 注入结果...")
    original_exif = read_exif_summary(original_path)
    spoofed_exif = read_exif_summary(spoofed_path)
    print(f"        原图 EXIF: {original_exif.get('has_exif')}, {original_exif.get('fields', 0)} 个字段")
    print(f"        伪造后 EXIF: {spoofed_exif.get('has_exif')}, {spoofed_exif.get('fields', 0)} 个字段")
    if spoofed_exif.get("Model"):
        print(f"        伪造相机: {spoofed_exif.get('Model')}")
    if spoofed_exif.get("Make"):
        print(f"        伪造品牌: {spoofed_exif.get('Make')}")
    
    # 检测原图
    print(f"  [3/5] HF ViT 检测原图（无伪造EXIF）...")
    orig_scores = detect_image(original_path)
    print(f"        AI={orig_scores.get('ai', 'N/A')}  真实={orig_scores.get('hum', 'N/A')}")
    
    # 检测伪造 EXIF 版本
    print(f"  [4/5] HF ViT 检测伪造EXIF版...")
    spoof_scores = detect_image(spoofed_path)
    print(f"        AI={spoof_scores.get('ai', 'N/A')}  真实={spoof_scores.get('hum', 'N/A')}")
    
    # 对比
    orig_ai = orig_scores.get("ai", 0)
    spoof_ai = spoof_scores.get("ai", 0)
    
    print(f"\n  [5/5] 对比总结:")
    print(f"        原图 AI 概率:        {orig_ai*100:.2f}%")
    print(f"        伪造EXIF后 AI 概率:  {spoof_ai*100:.2f}%")
    
    diff = abs(orig_ai - spoof_ai)
    if spoof_ai > 0.5:
        verdict = "✓ EXIF 伪造无法欺骗 AI 检测"
    else:
        verdict = "✗ EXIF 伪造成功骗过检测"
    print(f"        分数变化: {diff*100:.2f}%")
    print(f"        结论: {verdict}")
    
    results.append({
        "label": label,
        "filename": filename,
        "original": {"ai_score": orig_ai, "exif": original_exif},
        "spoofed": {"ai_score": spoof_ai, "exif": spoofed_exif},
        "spoofed_file": str(spoofed_path),
    })

# ============================================================
# 额外分析：EXIF 一致性检测逻辑
# ============================================================
print(f"\n{'='*70}")
print("EXIF 一致性分析（TrueLens 可用的反伪造策略）")
print(f"{'='*70}")

analysis = [
    ("EXIF 字段数量", "真实手机照片通常有 15-30+ 个 EXIF 字段；AI 生成图片通常 0-3 个", "可检测异常"),
    ("相机型号一致性", "EXIF 中 Make/Model/LensModel 必须一致（如 Apple+iPhone+Apple镜头）", "交叉验证"),
    ("GPS 时间戳", "GPS 时间戳必须与 DateTimeOriginal 一致", "时间一致性检查"),
    ("图像尺寸", "ExifImageWidth/Height 应与实际图片尺寸一致", "尺寸不匹配=篡改"),
    ("软件签名", "AI 工具常在 Software 字段留下痕迹（Midjourney/Stable Diffusion）", "软件指纹检测"),
    ("缩略图匹配", "JPEG EXIF 内嵌缩略图应与主图一致；换 EXIF 后缩略图不匹配", "缩略图比对"),
    ("C2PA 水印", "Adobe Firefly 等在元数据中嵌入 Content Credentials", "溯源标记检查"),
    ("像素级分析", "HF ViT 从像素纹理判断，不受 EXIF 影响", "核心防线"),
]

for name, desc, strategy in analysis:
    print(f"  • {name}: {desc}")
    print(f"    → 策略: {strategy}")

# 保存报告
report = {
    "test_results": results,
    "exif_analysis": [{"name": n, "description": d, "strategy": s} for n, d, s in analysis],
}
report_path = OUTPUT_DIR / "exif_spoof_report.json"
with open(report_path, "w", encoding="utf-8") as f:
    json.dump(report, f, ensure_ascii=False, indent=2)

print(f"\n完整报告: {report_path}")
