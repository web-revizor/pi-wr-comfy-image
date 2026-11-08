---
name: comfy-image
description: Read this before the first comfy_generate call. Rules for generating or editing images with the user's ComfyUI workflows, for when the user asks to create, draw, render, edit, restyle or retouch an image, or when a generation failed or came out wrong.
---

# Generating images with ComfyUI

## Pick the workflow

Use the workflow list in the `comfy_generate` description. Copy the name exactly, with its folder:
`folder/name`, not `name`.

- An image to change: pick a workflow that takes an image, and pass the file in `images`.
- No image: pick one that takes only a prompt.
- A workflow marked `[missing: file]` lacks a model or node. Prefer another one. If it is the only fit, tell the user
  what is missing, or pass another installed file when a param selects that model.
- If the user names a workflow or style, follow that, even over a better guess of yours.

## Write the prompt

- From text: describe the picture. Subject, then setting and light, in concrete words, keeping what the user said.
  "a red fox in a snowy forest, wildlife photograph", not "please make a nice picture of a fox".
- When a style matters, start with it and add its visible traits: "watercolor painting of a cozy bookshop, visible
  brush strokes on paper".
- Editing: write an instruction about the change only. "make it a snowy winter night", not a description of the whole
  result. Do not repeat what should stay the same unless it keeps getting lost.
- Put text that must appear in the image in double quotes.
- Translate the user's request to English when the workflow's own defaults and labels are in English, unless they ask
  otherwise. Keep names and quoted text as written.

## Set params

- Call `comfy_workflow_inputs` once for a workflow whose params you do not know, then reuse what it returned.
- Pass only what the request needs. Everything else keeps the value saved in the workflow, which its author chose.
- Use only names and choices from that list. Never invent a param or a file name.
- Set a seed only to repeat or vary a result. Do not add seed, steps or size by habit.
- Some workflows have a mode param that changes which other params apply. Set the mode first, and pass only the params
  that belong to it.

## Several images

- Use a variants or batch param if the workflow has one.
- Otherwise make one `comfy_generate` call per image, with a different seed for each. They run one after another.

## Check and improve

- Read a saved file only when you need to judge it or the user asks. The reply gives its path.
- The result ignored the request, or an edit came back unchanged or oversharpened: this depends on the seed. First run
  again with another seed, changing nothing else. The same seed gives the same result.
- Still wrong: make the prompt more concrete, then raise the steps if the workflow has them.
- A good result to vary: reuse the `seed` from the reply and change one thing at a time.
- Tell the user the file path and the seed. Do not retry more than twice without asking.

## Errors

- `is not responding`: ComfyUI is off. Ask the user to start it. Do not retry.
- `unknown input`, `must be one of`, `must be ≤`: use the names and values the error lists, then call again.
- `exposes no prompt input`: this workflow takes no text. Call it without `prompt`, or pick another one.
- `Value not in list`: usually a model file that is not installed. If a param selects that model, you may try one
  other installed file of the same model family, once, judging by its name. Never put in a file of another family: it
  fails, or gives garbage. Otherwise stop and name the missing file to the user.
- The same error twice: stop and tell the user. Do not vary other params to get around it.
- `is not installed in ComfyUI`: a custom node is missing. Tell the user which one.
- `no result after`: ComfyUI keeps working on it. Do not queue the same job again. Tell the user, and suggest raising
  `timeoutMs` in the config.
