FROM node:22.22-bullseye

RUN sed -i "s|http://deb.debian.org/debian|http://mirrors.tencent.com/debian|g; s|http://deb.debian.org/debian-security|http://mirrors.tencent.com/debian-security|g" /etc/apt/sources.list
ENV PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple PIP_TRUSTED_HOST=pypi.tuna.tsinghua.edu.cn
RUN npm config set registry https://registry.npmmirror.com

# Install system dependencies for Python and scientific libraries
RUN apt-get update && apt-get install -y \
    openssh-client \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    g++ \
    gcc \
    gfortran \
    libopenblas-dev \
    liblapack-dev \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]
