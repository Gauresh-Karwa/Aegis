import os
import subprocess
import time

dataset_dir = "backend/Aegis dataset/realistic document"
categories = ["safe", "risked"]
batch_size = 50

# First, commit any other remaining modifications in Aegis dataset
subprocess.run(["git", "add", "backend/Aegis dataset/*.py"])
subprocess.run(["git", "commit", "-m", "Update other dataset files"])
subprocess.run(["git", "push"])

for cat in categories:
    cat_dir = os.path.join(dataset_dir, cat)
    if not os.path.exists(cat_dir):
        continue
    applicants = sorted(os.listdir(cat_dir))
    for i in range(0, len(applicants), batch_size):
        batch = applicants[i:i+batch_size]
        print(f"Adding batch {i//batch_size} for {cat}...")
        
        has_changes = False
        for app in batch:
            path = os.path.join(cat_dir, app)
            path = path.replace("\\", "/")
            
            # Check if there are changes to add
            status = subprocess.run(["git", "status", "--porcelain", path], capture_output=True, text=True)
            if status.stdout.strip():
                subprocess.run(["git", "add", path])
                has_changes = True
                
        if has_changes:
            subprocess.run(["git", "commit", "-m", f"Add dataset {cat} batch {i//batch_size}"])
            print("Pushing...")
            result = subprocess.run(["git", "push"])
            if result.returncode != 0:
                print(f"Failed to push batch {i//batch_size}. Exiting.")
                exit(1)
            time.sleep(1)
        else:
            print(f"No changes in batch {i//batch_size} for {cat}.")
