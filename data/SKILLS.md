# Available Skills

## generate_image
Generate a static image of the character.
- content_type: `base` (no base images yet) | `content_post` (has base images)
- style: sexy | cute | warm | home | exposed | erotic
- cloth: daily | fashion | sexy_lingerie | sexy_underwear | home_wear | sports | nude
- scene_description: describe the scene, pose, or mood

## generate_video
Generate a short video. Auto-generates an image first, then animates it.
Same parameters as generate_image, plus:
- video_prompt: describe the motion (e.g. "slowly turns toward camera, hair flows in wind, confident smile")

## create_character
Create a new character profile.
- name, description, gender

## update_character
Update an existing character's name, description, or gender.

## add_base_image
Register an existing image URL as a base reference image for the character.
- image_url: the URL the user provided
Use this when the user says "use this as base image" or "add to base images" with a URL.

## fetch_instagram
Download reference images from an Instagram post.
- url: full Instagram post or reel URL (instagram.com/p/... or instagram.com/reel/...)

## list_characters
List all available characters. No parameters needed.

## general_chat
No generation action. Just respond conversationally.
