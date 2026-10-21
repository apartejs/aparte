---
'@aparte/provider-transformers': patch
---

`deleteCachedModel(id)` now deletes only that model's files; a model whose id starts with the same name keeps its weights.

The cache was matched by substring, so deleting `onnx-community/Qwen2.5-0.5B` also deleted `onnx-community/Qwen2.5-0.5B-Instruct`, and `getModelStatus` reported a model as `cached` when only that longer sibling was. Both now compare the model id read from each cached file's path, by equality.
