#!/bin/bash

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <src_directory> <output_file>"
  exit 1
fi

src_dir="$1"
output_file="$2"

> "$output_file"

cd "$src_dir" || exit 1

script_name=$(basename "$0")

find . -type f ! -path "./.git/*" | while read -r file; do
  if git check-ignore -q "$file" 2>/dev/null || [ "$(basename "$file")" = "$script_name" ]; then
    continue
  fi

  relative_path="${file#./}"
  echo -e "\n\n==== /$relative_path ====\n" >> "$output_file"
  cat "$file" >> "$output_file"
done

echo "done concatenating files from $src_dir into $output_file"
