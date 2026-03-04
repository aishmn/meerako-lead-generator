import type { ForgeConfig } from '@electron-forge/shared-types';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { VitePlugin } from '@electron-forge/plugin-vite';
import path from 'node:path';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

// Native modules that must be present in the package at runtime.
// better-sqlite3 uses 'bindings' to locate its .node file.
const NATIVE_RUNTIME_MODULES = ['better-sqlite3', 'bindings', 'file-uri-to-path'];
const MIGRATIONS_DIR = path.join('db', 'migrations');
const RENDERER_DIR_IN_PACKAGE = path.join('.vite', 'renderer');

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

      // 2. Copy SQL migrations so packaged apps can initialize the DB on first run.
      const migrationsSrc = path.join(projectRoot, MIGRATIONS_DIR);
      const migrationsDst = path.join(buildPath, MIGRATIONS_DIR);
      if (fs.existsSync(migrationsSrc)) {
        console.log('[forge] Copying DB migrations into package…');
        copyDir(migrationsSrc, migrationsDst);
      } else {
        console.warn(`[forge] DB migrations directory not found at ${migrationsSrc}`);
      }

      // 3. Copy renderer bundles where main process expects them.
      const rendererSrcCandidates = [
        path.join(projectRoot, '.vite', 'renderer'),
        path.join(projectRoot, 'src', 'renderer', '.vite', 'renderer'),
      ];
      const rendererSrc = rendererSrcCandidates.find((candidate) => fs.existsSync(candidate));
      if (!rendererSrc) {
        throw new Error(`Renderer build output not found. Checked:\n${rendererSrcCandidates.join('\n')}`);
      }
      const rendererDst = path.join(buildPath, RENDERER_DIR_IN_PACKAGE);
      console.log(`[forge] Copying renderer bundles from ${rendererSrc}…`);
      copyDir(rendererSrc, rendererDst);

      // 4. For Windows builds: ensure the Electron-targeted .node prebuild is used.
      if (platform === 'win32') {
        const sqlite3Dir = path.join(buildPath, 'node_modules', 'better-sqlite3');
        const prebuildCliCandidates = [
          path.join(projectRoot, 'node_modules', 'prebuild-install', 'bin.js'),
          path.join(projectRoot, 'node_modules', 'better-sqlite3', 'node_modules', 'prebuild-install', 'bin.js'),
        ];
        const prebuildCli = prebuildCliCandidates.find((candidate) => fs.existsSync(candidate));
        if (!prebuildCli) {
          throw new Error(`prebuild-install bin.js not found. Checked:\n${prebuildCliCandidates.join('\n')}`);
        }

        console.log(`[forge] Downloading Windows better-sqlite3 prebuild (Electron ${electronVersion}, ${arch})…`);
        execSync(
          `"${process.execPath}" "${prebuildCli}" --runtime=electron --target=${electronVersion} --platform=win32 --arch=${arch} --tag-prefix=v --force`,
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
      config: {},
    },
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'meerako-lead-generator',
        exe: 'meerako-lead-generator.exe',
      },
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
