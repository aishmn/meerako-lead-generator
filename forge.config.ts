import type { ForgeConfig } from '@electron-forge/shared-types';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { VitePlugin } from '@electron-forge/plugin-vite';
import path from 'node:path';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

// Native modules that must be present in the package at runtime.
// better-sqlite3 uses 'bindings' to locate its .node file.
const NATIVE_RUNTIME_MODULES = ['better-sqlite3', 'bindings'];

function copyDir(src: string, dst: string) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      // Unpack .node native binaries from the asar so they can be loaded
      unpack: '**/*.node',
    },
    icon: './public/icon',
    executableName: 'meerako-lead-generator',
  },
  rebuildConfig: {},

  hooks: {
    /**
     * The VitePlugin only puts Vite build output in the staging dir.
     * Native modules must be copied in manually so they're available at runtime.
     * For Windows builds on macOS, we also swap the macOS .node binary for the
     * Windows prebuild.
     */
    packageAfterPrune: async (_config, buildPath, electronVersion, platform, arch) => {
      const projectRoot = process.cwd();

      // 1. Copy native runtime modules into the staging node_modules
      for (const mod of NATIVE_RUNTIME_MODULES) {
        const src = path.join(projectRoot, 'node_modules', mod);
        const dst = path.join(buildPath, 'node_modules', mod);
        if (fs.existsSync(src) && !fs.existsSync(dst)) {
          console.log(`[forge] Copying ${mod} into package…`);
          copyDir(src, dst);
        }
      }

      // 2. For Windows builds: replace the macOS .node with the Windows prebuild
      if (platform === 'win32') {
        const sqlite3Dir = path.join(buildPath, 'node_modules', 'better-sqlite3');
        const prebuildBin = path.join(projectRoot, 'node_modules', '.bin', 'prebuild-install');

        console.log(`[forge] Downloading Windows better-sqlite3 prebuild (Electron ${electronVersion}, ${arch})…`);
        execSync(
          `"${prebuildBin}" --runtime=electron --target=${electronVersion} --platform=win32 --arch=${arch} --tag-prefix=v --force`,
          { cwd: sqlite3Dir, stdio: 'inherit' }
        );
        console.log('[forge] Windows native binary ready.');
      }
    },
  },

  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32', 'darwin', 'linux'],
    },
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: {},
    },
    {
      name: '@electron-forge/maker-deb',
      platforms: ['linux'],
      config: {},
    },
  ],

  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        {
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
};

export default config;
