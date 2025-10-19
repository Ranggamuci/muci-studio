export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  isFavorite: boolean;
}

// New types for Outfit Studio
export interface OutfitIdea {
  male: string; // English for prompt
  female: string; // English for prompt
  male_id: string; // Indonesian for UI
  female_id: string; // Indonesian for UI
  style: 'Berhijab' | 'Tanpa Hijab';
}

export interface OutfitPreview {
  idea: OutfitIdea;
  imageUrl: string | null;
  isLoading: boolean;
  error: string | null;
  statusText: string;
}

export interface OutfitStudioState {
  isOpen: boolean;
  type: 'Casual' | 'Adat' | null;
  ideas: OutfitIdea[];
  isLoadingIdeas: boolean;
  ideasError: string | null;
  selectedIdeaIndex: number | null;
  preview: OutfitPreview | null;
  locked: {
    male: boolean;
    female: boolean;
  };
}

export interface CreativeBrief {
  conceptStory: string;
  locationTheme: string;
  colorTone: 'Cerah & Alami' | 'Hangat & Keemasan' | 'Hitam & Putih';
  initialPrompt: string;
}

export interface FullCreativeConcept extends CreativeBrief {
  previewImageUrl?: string;
}

export interface OutfitChangerState {
  maleAnchor: IdentityAnchorFile | null;
  femaleAnchor: IdentityAnchorFile | null;
  isLoading: boolean;
  maleResultUrl: string | null;
  femaleResultUrl: string | null;
  error: string | null;
}

export interface ModalState {
  error: string | null;
  download: boolean;
  lightbox: string | null;
  editor: GeneratedImage | null;
  outfitStudio: boolean;
  promptViewer: string | null;
  burst: GeneratedImage | null;
  creativeDirector: boolean;
  promptPreview: { // For the new dedicated preview button
    isLoading: boolean;
    imageUrl: string | null;
    error: string | null;
    originalPrompt: string;
    // FIX: Add statusText to show progress during preview generation.
    statusText?: string;
  } | null;
  outfitChanger: OutfitChangerState | null;
}

export type Angle = 'depan' | 'samping';
export type Subject = 'pria' | 'wanita' | 'pasangan';

export interface IdentityAnchorFile {
    id: string;
    subject: Subject;
    angle: Angle;
    base64: string;
    mimeType: string;
    previewUrl: string;
}

export type ActiveTab = 'prompt' | 'reference';

export type ApiKeyStatus = 'active' | 'invalid' | 'exhausted' | 'unvalidated';

export interface ApiKey {
  id: string;
  value: string;
  masked: string;
  status: ApiKeyStatus;
  isSystem?: boolean;
}

export type WomanStyle = 'Referensi Photo' | 'Berhijab' | 'Tanpa Hijab';

export type AspectRatio = '4:5' | '1:1' | '16:9';
export type CameraShot = 'Full Body Shot' | 'Medium Shot' | 'Close-up' | 'Random' | 'Close-up Pria' | 'Close-up Wanita';

export interface GenerationDetails {
    scenarioScene: string;
    scenarioEmotion: string;
    locationTheme: string;
    styleAndColorInstruction: string;
    negativePromptInstruction: string;
    womanStyle: WomanStyle;
    userNotes?: string;
    studioDescription?: string;
    aspectRatio: AspectRatio;
    cameraShot: 'Full Body Shot' | 'Medium Shot' | 'Close-up' | 'Close-up Pria' | 'Close-up Wanita';
    clothingDescription?: string;
}