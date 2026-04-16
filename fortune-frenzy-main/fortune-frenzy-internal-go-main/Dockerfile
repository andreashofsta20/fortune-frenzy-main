FROM golang:1.22 AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# tidy fills transitive go.sum lines (e.g. golang.org/x/* via mongo-driver) when host go.sum is stale
RUN go mod tidy && CGO_ENABLED=0 GOOS=linux go build -o main .

FROM alpine:latest
RUN apk --no-cache add ca-certificates wget
WORKDIR /root/
COPY --from=builder /app/main .
EXPOSE 3004
CMD ["./main"]
