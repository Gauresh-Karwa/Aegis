import os
import subprocess
import time

dataset_dir = "backend/Aegis dataset/realistic document"
categories = ["safe", "risked"]
batch_size = 50

# First, remove the dataset from gitignore so we can add it
with open(".gitignore", "r") as f:
    lines = f.readlines()
with open(".gitignore", "w") as f:
    for line in lines:
        if "backend/Aegis dataset" not in line:
            f.write(line)

subprocess.run(["git", "add", ".gitignore"])
subprocess.run(["git", "commit", "-m", "Unignore dataset for batch pushing"])
subprocess.run(["git", "push"])

for cat in categories:
    cat_dir = os.path.join(dataset_dir, cat)
    if not os.path.exists(cat_dir):
        continue
    applicants = sorted(os.listdir(cat_dir))
    for i in range(0, len(applicants), batch_size):
        batch = applicants[i:i+batch_size]
        print(f"Adding batch {i//batch_size} for {cat}...")
        for app in batch:
            path = os.path.join(cat_dir, app)
            # Use forward slashes for git
            path = path.replace("\\", "/")
            subprocess.run(["git", "add", path])
        
        subprocess.run(["git", "commit", "-m", f"Add dataset {cat} batch {i//batch_size}"])
        print("Pushing...")
        result = subprocess.run(["git", "push"])
        if result.returncode != 0:
            print(f"Failed to push batch {i//batch_size}. Exiting.")
            exit(1)
        time.sleep(2)
