#!/usr/bin/env python3
"""Apply the Chinese model configuration UI to the pinned upstream source tree."""
import pathlib, shutil, sys
source = pathlib.Path(sys.argv[1])
overlay = pathlib.Path(__file__).parent / 'overlay'
shutil.copytree(overlay, source, dirs_exist_ok=True)
schema = source / 'ui/lib/types/schemas.ts'
content = schema.read_text()
for line in ['export { modelCapabilityFormSchema } from "@/lib/modelCapabilities";', 'export { channelOnboardingSchema } from "@/lib/channelOnboarding";']:
    if line not in content: content += '\n'+line+'\n'
schema.write_text(content)
