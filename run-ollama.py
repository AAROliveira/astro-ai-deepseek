import subprocess

try:
    subprocess.run(["ollama", "run", "gemma3:1b", "--num-thread", "16"], check=True)
except FileNotFoundError:
    print("Error: Ollama is not installed or not found in PATH.")
except subprocess.CalledProcessError as e:
    print(f"Error: Ollama failed with exit code {e.returncode}")
