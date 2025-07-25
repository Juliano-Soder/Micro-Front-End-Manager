const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    icon: './OIP',
    win32metadata: {
      CompanyName: "Grupo Casas Bahia",
      FileDescription: "Gerenciador de Micro Front-Ends",
      ProductName: "Micro Front-End Manager",
      OriginalFilename: "micro-front-end-manager.exe",
      InternalName: "micro-front-end-manager",
      FileVersion: "0.0.3",
      ProductVersion: "0.0.3",
      CompanyName: "Grupo Casas Bahia",
      LegalCopyright: "Copyright © 2025 Juliano Soder",
    },
    // Configuração para assinatura automática com novo certificado
    sign: {
      certificateFile: "./certs/micro-front-end-manager-new.pfx",
      certificatePassword: "MicroFE2025!",
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
        // Configurações adicionais para evitar falsos positivos
        noMsi: true, // Não criar MSI
        remoteReleases: false, // Não buscar releases remotos
        // Certificado para o instalador também
        certificateFile: './certs/micro-front-end-manager-new.pfx',
        certificatePassword: 'MicroFE2025!',
        // Metadados do instalador
        copyright: 'Copyright © 2025 Juliano Soder',
        description: 'Instalador do Micro Front-End Manager',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          maintainer: 'Juliano Soder',
          homepage: 'https://github.com/Juliano-Soder/Micro-Front-End-Manager',
          description: 'Gerenciador de Micro Front-Ends para desenvolvimento',
          productName: 'Micro Front-End Manager',
          genericName: 'Micro Frontend Manager',
          categories: ['Development', 'Utility'],
          icon: './OIP.png', // Para Linux, use PNG
          section: 'devel',
          priority: 'optional',
          depends: [],
        },
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          maintainer: 'Juliano Soder',
          homepage: 'https://github.com/Juliano-Soder/Micro-Front-End-Manager',
          description: 'Gerenciador de Micro Front-Ends para desenvolvimento',
          productName: 'Micro Front-End Manager',
          genericName: 'Micro Frontend Manager',
          categories: ['Development', 'Utility'],
          icon: './OIP.png', // Para Linux, use PNG
          license: 'MIT',
          group: 'Development/Tools',
        },
      },
    },
    {
      name: '@electron-forge/maker-flatpak',
      config: {
        options: {
          maintainer: 'Juliano Soder',
          homepage: 'https://github.com/Juliano-Soder/Micro-Front-End-Manager',
          description: 'Gerenciador de Micro Front-Ends para desenvolvimento',
          productName: 'Micro Front-End Manager',
          genericName: 'Micro Frontend Manager',
          categories: ['Development', 'Utility'],
          icon: './OIP.png', // Para Linux, use PNG
        },
      },
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
