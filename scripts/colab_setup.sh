#!/bin/sh
# Rebuild a fresh Colab runtime in one command (Drive must be mounted separately from a notebook cell).
# Usage: sh /content/touch_down/scripts/colab_setup.sh   (or curl the raw file after cloning)
set -e
apt-get -qq install -y libxi6 libxxf86vm1 libxfixes3 libxrender1 libgl1 libxkbcommon0 libsm6 > /dev/null
if [ ! -x /content/blender/blender ]; then
  wget -q https://download.blender.org/release/Blender5.2/blender-5.2.2-linux-x64.tar.xz -O /content/blender.tar.xz
  mkdir -p /content/blender && tar -xf /content/blender.tar.xz -C /content/blender --strip-components=1
fi
if [ ! -d /content/touch_down ]; then git clone -q https://github.com/aryanyaksh-art/touch_down.git /content/touch_down; fi
cd /content/touch_down && git pull -q && pip install -q -e .
export TOUCHDOWN_DATA=/content/data
python scripts/fetch_data.py && python scripts/build_dtm.py
/content/blender/blender --version | head -1
echo SETUP_DONE
