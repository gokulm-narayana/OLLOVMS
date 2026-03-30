import traceback
import transformers
import json

try:
    pipe = transformers.pipeline(model='sarvamai/shuka_v1', trust_remote_code=True, device='cpu', torch_dtype='float16')
    out = pipe('temp_shuka_audio.wav', chat=[{'role': 'system', 'content': 'respond to this user'}, {'role': 'user', 'content': '<|audio|>'}])
    print(out)
except Exception as e:
    traceback.print_exc()
