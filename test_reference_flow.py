"""Test script to verify the multi-reference image flow."""
import asyncio
import shutil
from pathlib import Path
import sys
import os

# Add project to path
project_dir = Path(__file__).parent
sys.path.insert(0, str(project_dir))
os.chdir(project_dir)

# Load .env
from dotenv import load_dotenv
load_dotenv()

from app.agent.skills.prompt_optimizer import PromptOptimizerSkill


async def test_reference_flow():
    """Test the prompt optimizer with a reference image."""

    # Setup: reference image should already be in uploads
    upload_dir = Path("/Users/welly/Desktop/Character Training/public/uploads")
    upload_dir.mkdir(parents=True, exist_ok=True)

    test_image_name = "test_reference_image.jpg"
    dest_image = upload_dir / test_image_name

    if not dest_image.exists():
        print(f"✗ Reference image not found: {dest_image}")
        print("  Please copy a reference image to this path first.")
        return
    else:
        print(f"✓ Found reference image: {dest_image}")

    # Initialize the prompt optimizer
    optimizer = PromptOptimizerSkill()

    # Test case: User says "參考這張的動作，穿瑜伽服"
    print("\n" + "="*60)
    print("測試: 參考這張的動作，穿瑜伽服")
    print("="*60)

    # Step 1: Analyze reference image
    print("\n[Step 1] GPT-4V 分析參考圖片...")
    reference_analysis = await optimizer.analyze_reference_image(
        image_path=f"/uploads/{test_image_name}",
        user_intent="參考這張的動作、姿勢"
    )
    print(f"\n分析結果:\n{reference_analysis}")

    # Step 2: Optimize prompt with reference
    print("\n[Step 2] 優化 Prompt...")
    optimized_prompt = await optimizer.optimize(
        prompt="參考這張的動作，穿瑜伽服",
        style="sexy",
        cloth="瑜伽服 (運動內衣和高腰瑜伽褲)",
        scene_description="戶外咖啡廳",
        character_description="年輕亞洲女性，黑色長髮，精緻五官",
        reference_image_path=f"/uploads/{test_image_name}",
        reference_description="參考動作和姿勢",
    )

    print(f"\n優化後的 Prompt:\n{optimized_prompt}")

    # Verify the prompt has the correct format
    print("\n" + "="*60)
    print("驗證結果:")
    print("="*60)

    checks = [
        ("[Reference Character]", "[Reference Character]" in optimized_prompt),
        ("[Reference Pose/Composition/Style]",
         "[Reference Pose" in optimized_prompt or
         "[Reference Composition" in optimized_prompt or
         "[Reference Style" in optimized_prompt),
        ("yoga / 瑜伽 服裝", "yoga" in optimized_prompt.lower()),
        ("不包含 sweater/cardigan (參考圖原本穿著)",
         "sweater" not in optimized_prompt.lower() and
         "cardigan" not in optimized_prompt.lower() and
         "off-shoulder" not in optimized_prompt.lower()),
    ]

    all_passed = True
    for name, passed in checks:
        status = "✓" if passed else "✗"
        print(f"  {status} {name}")
        if not passed:
            all_passed = False

    if all_passed:
        print("\n✓ 所有檢查通過！Prompt 格式正確。")
    else:
        print("\n✗ 有檢查未通過，需要調整。")

    # Cleanup
    # dest_image.unlink()


if __name__ == "__main__":
    asyncio.run(test_reference_flow())
