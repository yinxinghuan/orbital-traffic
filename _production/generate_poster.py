from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
source = Image.open(ROOT / "_production/poster-source-final.webp").convert("RGB")

# The platform respected the real render but retained its portrait aspect.
# Crop the clean star field and globe into the 1:1 catalog composition.
square = source.crop((0, 300, 704, 1004)).resize((1024, 1024), Image.Resampling.LANCZOS)
square = ImageEnhance.Contrast(square).enhance(1.05)
square = ImageEnhance.Color(square).enhance(1.04)
draw = ImageDraw.Draw(square)

label_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 18)
title_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Black.ttf", 82)

draw.rectangle((58, 48, 62, 202), fill=(114, 255, 208))
draw.text((82, 48), "03 / AIRSPACE STUDY", font=label_font, fill=(188, 215, 226), spacing=0)
draw.multiline_text((78, 73), "ORBITAL\nTRAFFIC", font=title_font, fill=(240, 249, 255), spacing=-12)

poster = ROOT / "public/poster.png"
thumb = ROOT / "_production/poster-thumb.png"
square.save(poster, optimize=True)
square.resize((160, 160), Image.Resampling.LANCZOS).save(thumb, optimize=True)
