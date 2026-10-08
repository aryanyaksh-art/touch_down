#!/bin/sh
# Prepare a fresh Kaggle notebook session (Internet must be ON in the notebook settings, which needs a phone-verified account).
# Everything heavy goes to /tmp so it is not saved as notebook output; only /kaggle/working is kept after a commit.
# Pick the accelerator "GPU T4 x2": Blender 5.x Cycles needs a Turing-or-newer card (the P100 option is too old).
set -e
apt-get -qq install -y libxi6 libxxf86vm1 libxfixes3 libxrender1 libgl1 libxkbcommon0 libsm6 > /dev/null
if [ ! -x /tmp/blender/blender ]; then
  wget -q https://download.blender.org/release/Blender5.2/blender-5.2.2-linux-x64.tar.xz -O /tmp/blender.tar.xz
  mkdir -p /tmp/blender && tar -xf /tmp/blender.tar.xz -C /tmp/blender --strip-components=1
fi
if [ ! -d /tmp/touch_down ]; then git clone -q https://github.com/aryanyaksh-art/touch_down.git /tmp/touch_down; fi
cd /tmp/touch_down && git pull -q && pip install -q -e .
export TOUCHDOWN_DATA=/tmp/data
python scripts/fetch_data.py && python scripts/build_dtm.py
/tmp/blender/blender --version | head -1
nvidia-smi --query-gpu=name --format=csv,noheader
echo SETUP_DONE
