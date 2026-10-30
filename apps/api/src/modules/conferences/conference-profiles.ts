import type { ConferenceFocus } from '@research/contracts';
// Application relevance tags, separate from the upstream CCF classification.
export const conferenceProfiles: Record<string, ConferenceFocus[]> = {
  'conference/AI/aaai.yml': ['ai', 'snn'], 'conference/AI/cvpr.yml': ['ai', 'edge', 'snn'],
  'conference/AI/iccv.yml': ['ai', 'edge', 'snn'], 'conference/AI/iclr.yml': ['ai', 'snn'],
  'conference/AI/icml.yml': ['ai', 'snn'], 'conference/AI/nips.yml': ['ai', 'snn'],
  'conference/DS/asplos.yml': ['systems', 'edge', 'snn'], 'conference/DS/atc.yml': ['systems', 'edge'],
  'conference/DS/dac.yml': ['systems', 'edge', 'snn'], 'conference/DS/eurosys.yml': ['systems', 'edge'],
  'conference/DS/fast.yml': ['systems'], 'conference/DS/hpca.yml': ['systems', 'edge', 'snn'],
  'conference/DS/isca.yml': ['systems', 'edge', 'snn'], 'conference/DS/micro.yml': ['systems', 'edge', 'snn'],
  'conference/DS/ppopp.yml': ['systems'], 'conference/DS/sc.yml': ['systems', 'ai'],
  'conference/NW/mobicom.yml': ['systems', 'edge'], 'conference/NW/nsdi.yml': ['systems', 'edge'],
  'conference/NW/sigcomm.yml': ['systems', 'edge'], 'conference/SE/osdi.yml': ['systems', 'edge'],
  'conference/SE/sosp.yml': ['systems', 'edge'],
};
