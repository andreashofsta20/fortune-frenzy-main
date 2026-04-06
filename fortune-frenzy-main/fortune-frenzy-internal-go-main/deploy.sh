#!/bin/bash

green='\033[0;32m'
blue='\033[0;34m'
magenta='\033[1;35m'
yellow='\033[1;33m'
red='\033[0;31m'
cyan='\033[0;36m'
nc='\033[0m'

colored_echo() {
  local color="$1"
  shift
  echo -e "${color}[$(date '+%Y-%m-%d %H:%M:%S.%3N')] $*${nc}"
}

run() {
  "$@" > /dev/null 2>&1
}

no_logs=false
if [ "$1" == "-nl" ]; then
  no_logs=true
fi

colored_echo "$green" "STARTING DEPLOYMENT..."

current_port=$(grep -oP 'proxy_pass http://127\.0\.0\.1:\K[0-9]+' /etc/nginx/sites-available/london.frazers.co)

if [ "$current_port" == "3003" ]; then
  new_port="3004"
else
  new_port="3003"
fi

colored_echo "$blue" "CURRENT PORT: $current_port"
colored_echo "$blue" "NEW PORT: $new_port"
colored_echo "$yellow" "Compiling and building the Go Docker image..."

run docker build -t ff-internal-go-new .

old_container=$(docker ps -q --filter "publish=${new_port}" --filter "ancestor=ff-internal-go" --filter "network=APIs")
if [ -n "$old_container" ]; then
  colored_echo "$red" "Removing current container on port $new_port..."
  run docker stop "$old_container"
  run docker rm "$old_container"
fi

run docker run --name FFInternalGoNew --net APIs -p "${new_port}:3004" -d --env-file .env ff-internal-go-new

colored_echo "$yellow" "Waiting for the container to be ready..."

max_attempts=300
attempt=1
while [ $attempt -le $max_attempts ]; do
  if curl -s "http://localhost:${new_port}/health" >/dev/null; then
    echo -en "\r${green}Container is ready!                                                ${nc}"
    break
  fi
  echo -en "\r${cyan}Attempt $attempt/$max_attempts: Container not ready yet, waiting...                ${nc}"
  sleep 0.5
  ((attempt++))
done
echo

if [ $attempt -gt $max_attempts ]; then
  colored_echo "$red" "Container failed to start properly after $((max_attempts * 0.5)) seconds"
  exit 1
fi

run sudo sed -i "s/127\.0\.0\.1:$current_port/127\.0\.0\.1:${new_port}/g" /etc/nginx/sites-available/london.frazers.co
run sudo systemctl reload nginx

if docker ps -a --format '{{.Names}}' | grep -q '^FFInternalGo$'; then
  colored_echo "$red" "Removing old container..."
  run docker stop FFInternalGo
  run docker rm FFInternalGo
fi

if docker images --format '{{.Repository}}:{{.Tag}}' | grep -q '^ff-internal-go-new:latest$'; then
  colored_echo "$red" "Cleaning up images..."
  run docker rmi ff-internal-go-new:latest
fi

run docker rename FFInternalGoNew FFInternalGo
colored_echo "$green" "Deployment Complete!"

if [ "$no_logs" = false ]; then
  colored_echo "$cyan" "Following container logs in real-time (Press Ctrl+C to exit)..."
  docker logs -f FFInternalGo
fi