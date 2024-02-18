FROM denoland/deno:debian-1.40.5

# The port that your application listens to.
EXPOSE 1993

WORKDIR /app

# Prefer not to run as root.
USER deno

# These steps will be re-run upon each file change in your working directory:
COPY . .

CMD ["run", "-A", "main.ts"]
