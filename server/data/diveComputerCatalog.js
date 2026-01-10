const diveComputerCatalog = {
  manufacturers: [
    {
      id: 'shearwater',
      name: 'Shearwater',
      logo: null,
      models: [
        {
          id: 'perdix',
          name: 'Perdix',
          has_ble: true,
          export_formats: ['uddf', 'csv'],
          ble_service_uuid: 'fe25c237-0ece-443c-b0aa-e02033e7029d',
          ble_char_uuid: '27b7570b-359e-45a3-91bb-cf7e70049bd2',
          protocol: 'shearwater'
        },
        {
          id: 'perdix_ai',
          name: 'Perdix AI',
          has_ble: true,
          export_formats: ['uddf', 'csv'],
          ble_service_uuid: 'fe25c237-0ece-443c-b0aa-e02033e7029d',
          ble_char_uuid: '27b7570b-359e-45a3-91bb-cf7e70049bd2',
          protocol: 'shearwater'
        },
        {
          id: 'teric',
          name: 'Teric',
          has_ble: true,
          export_formats: ['uddf', 'csv'],
          ble_service_uuid: 'fe25c237-0ece-443c-b0aa-e02033e7029d',
          ble_char_uuid: '27b7570b-359e-45a3-91bb-cf7e70049bd2',
          protocol: 'shearwater'
        },
        {
          id: 'petrel',
          name: 'Petrel',
          has_ble: true,
          export_formats: ['uddf', 'csv'],
          ble_service_uuid: 'fe25c237-0ece-443c-b0aa-e02033e7029d',
          ble_char_uuid: '27b7570b-359e-45a3-91bb-cf7e70049bd2',
          protocol: 'shearwater'
        },
        {
          id: 'petrel_2',
          name: 'Petrel 2',
          has_ble: true,
          export_formats: ['uddf', 'csv'],
          ble_service_uuid: 'fe25c237-0ece-443c-b0aa-e02033e7029d',
          ble_char_uuid: '27b7570b-359e-45a3-91bb-cf7e70049bd2',
          protocol: 'shearwater'
        },
        {
          id: 'peregrine',
          name: 'Peregrine',
          has_ble: true,
          export_formats: ['uddf', 'csv'],
          ble_service_uuid: 'fe25c237-0ece-443c-b0aa-e02033e7029d',
          ble_char_uuid: '27b7570b-359e-45a3-91bb-cf7e70049bd2',
          protocol: 'shearwater'
        },
        {
          id: 'nerd',
          name: 'Nerd',
          has_ble: true,
          export_formats: ['uddf', 'csv'],
          ble_service_uuid: 'fe25c237-0ece-443c-b0aa-e02033e7029d',
          ble_char_uuid: '27b7570b-359e-45a3-91bb-cf7e70049bd2',
          protocol: 'shearwater'
        },
        {
          id: 'nerd_2',
          name: 'Nerd 2',
          has_ble: true,
          export_formats: ['uddf', 'csv'],
          ble_service_uuid: 'fe25c237-0ece-443c-b0aa-e02033e7029d',
          ble_char_uuid: '27b7570b-359e-45a3-91bb-cf7e70049bd2',
          protocol: 'shearwater'
        }
      ]
    },
    {
      id: 'suunto',
      name: 'Suunto',
      logo: null,
      models: [
        {
          id: 'd5',
          name: 'D5',
          has_ble: true,
          export_formats: ['uddf', 'subsurface'],
          ble_service_uuid: null,
          protocol: 'suunto'
        },
        {
          id: 'eon_steel',
          name: 'EON Steel',
          has_ble: true,
          export_formats: ['uddf', 'subsurface'],
          ble_service_uuid: null,
          protocol: 'suunto'
        },
        {
          id: 'eon_steel_black',
          name: 'EON Steel Black',
          has_ble: true,
          export_formats: ['uddf', 'subsurface'],
          ble_service_uuid: null,
          protocol: 'suunto'
        },
        {
          id: 'eon_core',
          name: 'EON Core',
          has_ble: true,
          export_formats: ['uddf', 'subsurface'],
          ble_service_uuid: null,
          protocol: 'suunto'
        },
        {
          id: 'vyper_novo',
          name: 'Vyper Novo',
          has_ble: false,
          export_formats: ['uddf', 'subsurface'],
          protocol: null
        },
        {
          id: 'zoop_novo',
          name: 'Zoop Novo',
          has_ble: false,
          export_formats: ['uddf', 'subsurface'],
          protocol: null
        }
      ]
    },
    {
      id: 'mares',
      name: 'Mares',
      logo: null,
      models: [
        {
          id: 'genius',
          name: 'Genius',
          has_ble: true,
          export_formats: ['uddf'],
          ble_service_uuid: null,
          protocol: 'mares'
        },
        {
          id: 'horizon',
          name: 'Horizon',
          has_ble: true,
          export_formats: ['uddf'],
          ble_service_uuid: null,
          protocol: 'mares'
        },
        {
          id: 'quad',
          name: 'Quad',
          has_ble: true,
          export_formats: ['uddf'],
          ble_service_uuid: null,
          protocol: 'mares'
        },
        {
          id: 'quad_air',
          name: 'Quad Air',
          has_ble: true,
          export_formats: ['uddf'],
          ble_service_uuid: null,
          protocol: 'mares'
        },
        {
          id: 'smart',
          name: 'Smart',
          has_ble: true,
          export_formats: ['uddf'],
          ble_service_uuid: null,
          protocol: 'mares'
        },
        {
          id: 'smart_air',
          name: 'Smart Air',
          has_ble: true,
          export_formats: ['uddf'],
          ble_service_uuid: null,
          protocol: 'mares'
        },
        {
          id: 'puck_pro',
          name: 'Puck Pro',
          has_ble: false,
          export_formats: ['uddf'],
          protocol: null
        },
        {
          id: 'puck_2',
          name: 'Puck 2',
          has_ble: false,
          export_formats: ['uddf'],
          protocol: null
        }
      ]
    },
    {
      id: 'garmin',
      name: 'Garmin',
      logo: null,
      models: [
        {
          id: 'descent_mk1',
          name: 'Descent Mk1',
          has_ble: false,
          export_formats: ['csv'],
          protocol: null,
          note: 'Proprietary - use Garmin Dive app export'
        },
        {
          id: 'descent_mk2',
          name: 'Descent Mk2',
          has_ble: false,
          export_formats: ['csv'],
          protocol: null,
          note: 'Proprietary - use Garmin Dive app export'
        },
        {
          id: 'descent_mk2i',
          name: 'Descent Mk2i',
          has_ble: false,
          export_formats: ['csv'],
          protocol: null,
          note: 'Proprietary - use Garmin Dive app export'
        },
        {
          id: 'descent_mk2s',
          name: 'Descent Mk2s',
          has_ble: false,
          export_formats: ['csv'],
          protocol: null,
          note: 'Proprietary - use Garmin Dive app export'
        },
        {
          id: 'descent_mk3',
          name: 'Descent Mk3',
          has_ble: false,
          export_formats: ['csv'],
          protocol: null,
          note: 'Proprietary - use Garmin Dive app export'
        },
        {
          id: 'descent_mk3i',
          name: 'Descent Mk3i',
          has_ble: false,
          export_formats: ['csv'],
          protocol: null,
          note: 'Proprietary - use Garmin Dive app export'
        },
        {
          id: 'descent_g1',
          name: 'Descent G1',
          has_ble: false,
          export_formats: ['csv'],
          protocol: null,
          note: 'Proprietary - use Garmin Dive app export'
        }
      ]
    },
    {
      id: 'scubapro',
      name: 'Scubapro',
      logo: null,
      models: [
        {
          id: 'g2',
          name: 'G2',
          has_ble: true,
          export_formats: ['uddf'],
          ble_service_uuid: null,
          protocol: 'scubapro'
        },
        {
          id: 'g2_console',
          name: 'G2 Console',
          has_ble: true,
          export_formats: ['uddf'],
          ble_service_uuid: null,
          protocol: 'scubapro'
        },
        {
          id: 'g2_hud',
          name: 'G2 HUD',
          has_ble: true,
          export_formats: ['uddf'],
          ble_service_uuid: null,
          protocol: 'scubapro'
        },
        {
          id: 'a1',
          name: 'A1',
          has_ble: true,
          export_formats: ['uddf'],
          ble_service_uuid: null,
          protocol: 'scubapro'
        },
        {
          id: 'a2',
          name: 'A2',
          has_ble: true,
          export_formats: ['uddf'],
          ble_service_uuid: null,
          protocol: 'scubapro'
        },
        {
          id: 'aladin_h_matrix',
          name: 'Aladin H Matrix',
          has_ble: true,
          export_formats: ['uddf'],
          ble_service_uuid: null,
          protocol: 'scubapro'
        },
        {
          id: 'aladin_sport_matrix',
          name: 'Aladin Sport Matrix',
          has_ble: true,
          export_formats: ['uddf'],
          ble_service_uuid: null,
          protocol: 'scubapro'
        }
      ]
    },
    {
      id: 'aqualung',
      name: 'Aqualung',
      logo: null,
      models: [
        {
          id: 'i330r',
          name: 'i330R',
          has_ble: true,
          export_formats: ['uddf'],
          ble_service_uuid: null,
          protocol: 'aqualung'
        },
        {
          id: 'i470tc',
          name: 'i470TC',
          has_ble: true,
          export_formats: ['uddf'],
          ble_service_uuid: null,
          protocol: 'aqualung'
        },
        {
          id: 'i550',
          name: 'i550',
          has_ble: true,
          export_formats: ['uddf'],
          ble_service_uuid: null,
          protocol: 'aqualung'
        },
        {
          id: 'i770r',
          name: 'i770R',
          has_ble: true,
          export_formats: ['uddf'],
          ble_service_uuid: null,
          protocol: 'aqualung'
        },
        {
          id: 'i200c',
          name: 'i200C',
          has_ble: true,
          export_formats: ['uddf'],
          ble_service_uuid: null,
          protocol: 'aqualung'
        },
        {
          id: 'i300c',
          name: 'i300C',
          has_ble: true,
          export_formats: ['uddf'],
          ble_service_uuid: null,
          protocol: 'aqualung'
        }
      ]
    },
    {
      id: 'oceanic',
      name: 'Oceanic',
      logo: null,
      models: [
        {
          id: 'geo_4',
          name: 'Geo 4.0',
          has_ble: true,
          export_formats: ['uddf'],
          ble_service_uuid: null,
          protocol: 'oceanic'
        },
        {
          id: 'pro_plus_4',
          name: 'Pro Plus 4',
          has_ble: true,
          export_formats: ['uddf'],
          ble_service_uuid: null,
          protocol: 'oceanic'
        },
        {
          id: 'pro_plus_x',
          name: 'Pro Plus X',
          has_ble: true,
          export_formats: ['uddf'],
          ble_service_uuid: null,
          protocol: 'oceanic'
        },
        {
          id: 'veo_4',
          name: 'Veo 4.0',
          has_ble: true,
          export_formats: ['uddf'],
          ble_service_uuid: null,
          protocol: 'oceanic'
        }
      ]
    },
    {
      id: 'cressi',
      name: 'Cressi',
      logo: null,
      models: [
        {
          id: 'goa',
          name: 'Goa',
          has_ble: true,
          export_formats: ['uddf'],
          ble_service_uuid: null,
          protocol: 'cressi'
        },
        {
          id: 'giotto',
          name: 'Giotto',
          has_ble: false,
          export_formats: ['uddf'],
          protocol: null
        },
        {
          id: 'newton',
          name: 'Newton',
          has_ble: false,
          export_formats: ['uddf'],
          protocol: null
        },
        {
          id: 'cartesio',
          name: 'Cartesio',
          has_ble: false,
          export_formats: ['uddf'],
          protocol: null
        }
      ]
    },
    {
      id: 'heinrichsweikamp',
      name: 'Heinrichs Weikamp',
      logo: null,
      models: [
        {
          id: 'ostc_4',
          name: 'OSTC 4',
          has_ble: true,
          export_formats: ['uddf'],
          ble_service_uuid: null,
          protocol: 'hw_ostc'
        },
        {
          id: 'ostc_plus',
          name: 'OSTC+',
          has_ble: true,
          export_formats: ['uddf'],
          ble_service_uuid: null,
          protocol: 'hw_ostc'
        },
        {
          id: 'ostc_sport',
          name: 'OSTC Sport',
          has_ble: true,
          export_formats: ['uddf'],
          ble_service_uuid: null,
          protocol: 'hw_ostc'
        },
        {
          id: 'ostc_2',
          name: 'OSTC 2',
          has_ble: false,
          export_formats: ['uddf'],
          protocol: null
        },
        {
          id: 'ostc_3',
          name: 'OSTC 3',
          has_ble: false,
          export_formats: ['uddf'],
          protocol: null
        }
      ]
    },
    {
      id: 'other',
      name: 'Other / Unknown',
      logo: null,
      models: [
        {
          id: 'other',
          name: 'Other Dive Computer',
          has_ble: false,
          export_formats: ['uddf', 'subsurface', 'csv'],
          protocol: null,
          note: 'Use file import with UDDF, Subsurface XML, or CSV export'
        }
      ]
    }
  ],

  getManufacturer(brandId) {
    return this.manufacturers.find(m => m.id === brandId);
  },

  getModel(brandId, modelId) {
    const manufacturer = this.getManufacturer(brandId);
    if (!manufacturer) return null;
    return manufacturer.models.find(m => m.id === modelId);
  },

  hasBleSupport(brandId, modelId) {
    const model = this.getModel(brandId, modelId);
    return model?.has_ble ?? false;
  },

  getExportFormats(brandId, modelId) {
    const model = this.getModel(brandId, modelId);
    return model?.export_formats ?? ['uddf', 'csv'];
  },

  getAllManufacturersForSelect() {
    return this.manufacturers.map(m => ({
      id: m.id,
      name: m.name
    }));
  },

  getModelsForSelect(brandId) {
    const manufacturer = this.getManufacturer(brandId);
    if (!manufacturer) return [];
    return manufacturer.models.map(m => ({
      id: m.id,
      name: m.name,
      has_ble: m.has_ble,
      note: m.note
    }));
  }
};

module.exports = diveComputerCatalog;
