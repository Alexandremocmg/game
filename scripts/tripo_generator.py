#!/usr/bin/env python3
import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.parse
import uuid

BASE_URL = "https://openapi.tripo3d.ai/v3"

def get_headers(api_key: str, json_type: bool = True):
    headers = {"Authorization": f"Bearer {api_key}"}
    if json_type:
        headers["Content-Type"] = "application/json"
    return headers

def post_json(url: str, data: dict, api_key: str):
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode("utf-8"),
        headers=get_headers(api_key, json_type=True),
        method="POST"
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        print(f"❌ HTTP Error {e.code}: {err_msg}")
        raise

def get_json(url: str, api_key: str):
    req = urllib.request.Request(url, headers=get_headers(api_key, json_type=True), method="GET")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def upload_file(file_path: str, api_key: str) -> str:
    print(f"📤 Enviando imagem para o Tripo 3D ({file_path})...")
    boundary = uuid.uuid4().hex
    
    filename = os.path.basename(file_path)
    with open(file_path, "rb") as f:
        file_bytes = f.read()
        
    ext = os.path.splitext(filename)[1].replace(".", "").lower()
    mime_type = f"image/{'jpeg' if ext == 'jpg' else ext}"

    body = bytearray()
    body.extend(f"--{boundary}\r\n".encode())
    body.extend(f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode())
    body.extend(f"Content-Type: {mime_type}\r\n\r\n".encode())
    body.extend(file_bytes)
    body.extend(f"\r\n--{boundary}--\r\n".encode())

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": f"multipart/form-data; boundary={boundary}"
    }

    req = urllib.request.Request(f"{BASE_URL}/files", data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            res = json.loads(resp.read().decode("utf-8"))
            if res.get("code") == 0:
                file_token = res["data"]["file_token"]
                print(f"✅ Upload concluído! File Token: {file_token}")
                return file_token
            else:
                raise RuntimeError(f"Erro no upload do arquivo: {res}")
    except urllib.error.HTTPError as e:
        print(f"❌ HTTP Error no Upload {e.code}: {e.read().decode('utf-8')}")
        raise

def poll_task(task_id: str, api_key: str, interval: int = 3, timeout: int = 300):
    url = f"{BASE_URL}/tasks/{task_id}"
    start_time = time.time()
    print(f"⏳ Aguardando tarefa {task_id} no Tripo 3D...")
    while time.time() - start_time < timeout:
        res = get_json(url, api_key)
        code = res.get("code")
        if code != 0:
            raise RuntimeError(f"Erro na API Tripo: {res}")
        
        data = res.get("data", {})
        status = data.get("status")
        progress = data.get("progress", 0)
        print(f"   Status: {status} ({progress}%)")
        
        if status == "success":
            return data
        elif status in ("failed", "cancelled"):
            raise RuntimeError(f"Falha na geração do modelo: {data}")
        
        time.sleep(interval)
    raise TimeoutError("Tempo limite excedido aguardando o Tripo 3D.")

def download_file(url: str, dest_path: str):
    print(f"⬇️ Baixando arquivo para {dest_path}...")
    os.makedirs(os.path.dirname(os.path.abspath(dest_path)), exist_ok=True)
    urllib.request.urlretrieve(url, dest_path)
    print(f"✅ Arquivo salvo com sucesso em {dest_path}")

def auto_rig_and_animate(model_task_id: str, api_key: str) -> str:
    print(f"\n🦴 Iniciando Auto-Rigging & Animação para o modelo {model_task_id}...")
    
    # 1. Rigging
    print(f"   Criando esqueleto de ossos (Auto-Rig)...")
    rig_payload = {
        "original_model_task_id": model_task_id,
        "model": "v2.5-20260210",
        "rig_type": "biped"
    }
    rig_res = post_json(f"{BASE_URL}/animations/rig", rig_payload, api_key)
    if rig_res.get("code") != 0:
        raise RuntimeError(f"Falha no disparo do Auto-Rig: {rig_res}")
        
    rig_task_id = rig_res["data"]["task_id"]
    rig_data = poll_task(rig_task_id, api_key)
    
    # 2. Retargeting Animações
    print(f"   Aplicando presets de animações de corrida...")
    retarget_payload = {
        "original_model_task_id": rig_task_id,
        "animation": "preset:run",
        "model": "v2.5-20260210"
    }
    anim_res = post_json(f"{BASE_URL}/animations/retarget", retarget_payload, api_key)
    if anim_res.get("code") != 0:
        raise RuntimeError(f"Falha no retargeting de animação: {anim_res}")
        
    anim_task_id = anim_res["data"]["task_id"]
    anim_data = poll_task(anim_task_id, api_key)
    
    output = anim_data.get("output", {})
    anim_url = output.get("model_url") or output.get("model")
    if not anim_url and "model_urls" in output and len(output["model_urls"]) > 0:
        anim_url = output["model_urls"][0]
        
    if not anim_url and isinstance(output, dict):
        for k, v in output.items():
            if isinstance(v, str) and (v.endswith(".glb") or "glb" in v):
                anim_url = v
                break

    return anim_url

def generate_image_to_3d(image_input: str, output_file: str, api_key: str, face_limit: int = 5000, active_task_id: str = None):
    local_temp = None
    task_id = active_task_id

    if not task_id:
        if image_input.startswith("http://") or image_input.startswith("https://"):
            print(f"🌐 Baixando imagem da web: {image_input}")
            local_temp = "temp_concept_input.png"
            urllib.request.urlretrieve(image_input, local_temp)
            file_path = local_temp
        else:
            file_path = image_input

        file_token = upload_file(file_path, api_key)
        
        ext = os.path.splitext(file_path)[1].replace(".", "").lower()
        file_type = "jpeg" if ext in ("jpg", "jpeg") else "png"

        payload = {
            "type": "image_to_model",
            "file": {
                "type": file_type,
                "file_token": file_token
            },
            "model": "v3.1-20260211",
            "face_limit": face_limit,
            "texture": True,
            "pbr": True
        }

        print(f"\n🚀 Disparando tarefa Image-to-3D na Tripo 3D API (Modelo v3.1)...")
        res = post_json(f"{BASE_URL}/generation/image-to-model", payload, api_key)
        if res.get("code") != 0:
            print(f"❌ Erro ao disparar tarefa: {res}")
            sys.exit(1)
            
        task_id = res["data"]["task_id"]

    try:
        result_data = poll_task(task_id, api_key)
        output = result_data.get("output", {})
        model_url = output.get("model") or output.get("pbr_model")
        
        if isinstance(output, dict):
            for k, v in output.items():
                if isinstance(v, str) and (v.endswith(".glb") or "glb" in v):
                    model_url = v
                    break

        # Tenta aplicar Auto-Rig e Animação
        try:
            animated_url = auto_rig_and_animate(task_id, api_key)
            if animated_url:
                model_url = animated_url
        except Exception as e:
            print(f"⚠️ Aviso: Auto-Rigging falhou ({e}). Usando modelo 3D estático base.")

        if not model_url:
            print(f"⚠️ Não foi possível encontrar a URL do arquivo GLB no retorno: {output}")
            sys.exit(1)

        download_file(model_url, output_file)
        print(f"✨ Modelo 3D gerado e baixado com sucesso! Arquivo: {output_file}")
        return task_id
    finally:
        if local_temp and os.path.exists(local_temp):
            os.remove(local_temp)

def load_env_file():
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    k = k.strip()
                    v = v.strip().strip("'\"")
                    if k not in os.environ:
                        os.environ[k] = v

def main():
    load_env_file()
    parser = argparse.ArgumentParser(description="Gerador de Modelos 3D via Tripo 3D API")
    parser.add_argument("--image", type=str, help="Caminho ou URL da imagem para Image-to-3D")
    parser.add_argument("--out", type=str, default="public/models/player.glb", help="Caminho do arquivo de saída GLB")
    parser.add_argument("--key", type=str, help="API Key do Tripo 3D (ou defina TRIPO_API_KEY)")
    parser.add_argument("--face-limit", type=int, default=5000, help="Limite máximo de polígonos")
    parser.add_argument("--task-id", type=str, help="Resume uma tarefa já iniciada pelo ID")
    
    args = parser.parse_args()
    
    api_key = args.key or os.environ.get("TRIPO_API_KEY")
    if not api_key:
        print("❌ Chave de API não encontrada! Informe via --key ou defina TRIPO_API_KEY.")
        sys.exit(1)
        
    generate_image_to_3d(args.image, args.out, api_key, face_limit=args.face_limit, active_task_id=args.task_id)

if __name__ == "__main__":
    main()
