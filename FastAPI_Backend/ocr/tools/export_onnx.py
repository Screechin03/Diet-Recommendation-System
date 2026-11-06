import sys, json, h5py, numpy as np, tensorflow as tf, tf2onnx, onnxruntime as ort
src, dst = sys.argv[1], sys.argv[2]
def strip(o):
    if isinstance(o,dict): return {k:strip(v) for k,v in o.items() if k!="quantization_config"}
    if isinstance(o,list): return [strip(v) for v in o]
    return o
with h5py.File(src,"r") as f: cfg=json.loads(f.attrs["model_config"])
m=tf.keras.models.Model.from_config(strip(cfg)["config"]); m.load_weights(src)
spec=(tf.TensorSpec((None,32,32,1),tf.float32,name="image"),)
@tf.function(input_signature=spec)
def f(image): return {"probs": m(image, training=False)}
tf2onnx.convert.from_function(f, input_signature=spec, opset=17, output_path=dst)
# parity check on random + real-like inputs
x=np.random.RandomState(0).rand(64,32,32,1).astype("float32")
a=m.predict(x,verbose=0); b=ort.InferenceSession(dst).run(None,{"image":x})[0]
print("max abs diff", float(np.abs(a-b).max()), "argmax equal", bool((a.argmax(1)==b.argmax(1)).all()))
