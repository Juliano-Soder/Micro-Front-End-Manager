const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    win32metadata: {
      CompanyName: "Grupo Casas Bahia",
      FileDescription: "Gerenciador de Micro Front-Ends",
      ProductName: "Micro Front-End Manager",
    },
    // Configuração para assinatura automática
    sign: {
      certificateFile: "C:\\certificados\\micro-front-end-manager.pfx",
      certificatePassword: "Via!2022",
    },
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'micro_front_end_manager',
        authors: 'Juliano Soder',
        exe: 'micro-front-end-manager.exe',
        setupExe: 'MicroFrontEndManagerSetup.exe', // Nome do instalador
        setupIcon: './OIP.ico', // Ícone do instalador
        shortcutName: 'Micro Front-End Manager', // Nome do atalho
        createDesktopShortcut: true, // Garante que o atalho na área de trabalho seja criado
        createStartMenuShortcut: true,
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
