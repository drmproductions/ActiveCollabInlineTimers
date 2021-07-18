#!/usr/bin/env -S bash

cd ..
rm -f ActiveCollabInlineTimers.zip
zip -x "*/mkzip.sh" -x "*.code-workspace" -x "*/icon.ai" -x "*/README.md" -x '*.git*' -r ActiveCollabInlineTimers.zip ActiveCollabInlineTimers/
