
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import saveAs from 'file-saver';
import JSZip from 'jszip';
import { GeneratedImage, ModalState, IdentityAnchorFile, ApiKey, ApiKeyStatus, WomanStyle, Angle, Subject, GenerationDetails, AspectRatio, CameraShot } from './types';
import { generateImage, generateLocationBasedScenarios, validateApiKey, generatePhotoFromReference, changeReferenceOutfit, generateStudioSetDescription, enhanceLocationTheme, generateText } from './services/geminiService';
import { shuffleArray, generateRandomFilename, cropImage, getRandomUnique } from './utils';
import * as D from './creativeData';


// --- START: Merged content from components/modals/CommonModals.tsx ---

interface CommonModalsProps {
    modals: ModalState;
    setModals: React.Dispatch<React.SetStateAction<ModalState>>;
    isApiModalOpen: boolean;
    setIsApiModalOpen: (isOpen: boolean) => void;
    isAllKeysFailedModalOpen: boolean;
    setIsAllKeysFailedModalOpen: (isOpen: boolean) => void;
    apiKeys: ApiKey[];
    apiKeyInput: string;
    setApiKeyInput: React.Dispatch<React.SetStateAction<string>>;
    isKeyValidationLoading: boolean;
    handleSaveApiKeys: () => void;
    handleValidateKeys: () => Promise<void>;
    handleRemoveApiKey: (id: string) => void;
    handleClearApiKeys: () => void;
    handleDownloadZip: (onlyFavorites?: boolean) => Promise<void>;
    handleDownloadSingle: (url: string) => void;
    generatedImages: GeneratedImage[];
    handleApplyEdit: (editPrompt: string) => Promise<void>;
    womanStyle: WomanStyle;
    // Outfit Changer Props
    performApiCall: <T>(apiFunction: (apiKey: string) => Promise<T>, onStatusUpdate: (status: string) => void) => Promise<T>;
    handleApplyOutfitChange: (subject: 'pria' | 'wanita', newImageUrl: string) => void;
    activeApiKeyMasked: string | null;
    // Burst Mode Props
    handleGenerateBurstImage: (image: GeneratedImage) => Promise<string>;
    handleSelectBurstWinner: (originalImageId: string, newImageUrl: string) => void;
    isSystemKeyAvailable: boolean;
    systemKeyOwnerId: string;
    primaryApiKeyId: string | null;
    setPrimaryApiKeyId: React.Dispatch<React.SetStateAction<string | null>>;
    handleExportApiKeys: () => void;
    handleImportApiKeys: () => void;
}

const ApiKeyStatusIndicator: React.FC<{ status: ApiKeyStatus }> = ({ status }) => {
    const statusMap = {
        active: { text: 'Aktif', color: 'bg-green-500' },
        invalid: { text: 'Tidak Valid', color: 'bg-red-500' },
        exhausted: { text: 'Kuota Habis', color: 'bg-yellow-500' },
        unvalidated: { text: 'Belum Divalidasi', color: 'bg-gray-500' },
    };
    const { text, color } = statusMap[status];
    return (
        <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${color}`}></span>
            <span className="text-xs text-gray-500">{text}</span>
        </div>
    );
};

const TabButton: React.FC<{ title: string; active: boolean; onClick: () => void }> = ({ title, active, onClick }) => (
    <button
        onClick={onClick}
        className={`px-4 py-2 text-sm font-bold transition-colors ${
            active
                ? 'border-b-2 border-orange-500 text-orange-600'
                : 'text-gray-500 hover:text-gray-800'
        }`}
    >
        {title}
    </button>
);

const Spinner: React.FC = () => (
    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

const CommonModals: React.FC<CommonModalsProps> = ({
    modals, setModals, isApiModalOpen, setIsApiModalOpen, isAllKeysFailedModalOpen, setIsAllKeysFailedModalOpen,
    apiKeys, apiKeyInput, setApiKeyInput, isKeyValidationLoading, handleSaveApiKeys, handleValidateKeys, 
    handleRemoveApiKey, handleClearApiKeys, handleDownloadZip, handleDownloadSingle, generatedImages, handleApplyEdit,
    womanStyle,
    performApiCall,
    handleApplyOutfitChange, activeApiKeyMasked,
    handleGenerateBurstImage, handleSelectBurstWinner,
    isSystemKeyAvailable, systemKeyOwnerId,
    primaryApiKeyId, setPrimaryApiKeyId,
    handleExportApiKeys, handleImportApiKeys
}) => {
    const closeModal = () => setModals({ error: null, download: false, lightbox: null, editor: null, outfitStudio: false, promptViewer: null, burst: null, creativeDirector: false, promptPreview: null, outfitChanger: null });
    
    const [editPrompt, setEditPrompt] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    
    // State for Burst Modal
    const [burstVariations, setBurstVariations] = useState<string[]>([]);
    const [isBursting, setIsBursting] = useState(false);
    const [burstError, setBurstError] = useState<string | null>(null);

    // State for Outfit Changer Modal
    const [outfitChangePrompt, setOutfitChangePrompt] = useState('');
    const [usedOutfits, setUsedOutfits] = useState(new Set<string>());
    const [outfitActiveTab, setOutfitActiveTab] = useState<'pria' | 'wanita'>('pria');
    const [isEnhancingPrompt, setIsEnhancingPrompt] = useState(false);
    const [isFetchingInspiration, setIsFetchingInspiration] = useState(false);
    const outfitChangerOpened = useRef(false);


    useEffect(() => {
        if (modals.burst) {
            const runBurst = async () => {
                setIsBursting(true);
                setBurstVariations([]);
                setBurstError(null);
                const variations: string[] = [];
                try {
                    for (let i = 0; i < 3; i++) {
                        if (!modals.burst) break;
                        const newUrl = await handleGenerateBurstImage(modals.burst);
                        variations.push(newUrl);
                        setBurstVariations([...variations]);
                    }
                } catch (e) {
                    // FIX: Safely handle error of type 'unknown' in catch block.
                    console.error("Burst generation failed:", e);
                    const errorMessage = e instanceof Error ? e.message : String(e);
                    setBurstError(errorMessage.startsWith("ALL_KEYS_FAILED") ? "Semua kunci API gagal atau kuota habis." : (errorMessage || "Gagal menghasilkan variasi."));
                } finally {
                    setIsBursting(false);
                }
            };
            runBurst();
        }
    }, [modals.burst, handleGenerateBurstImage]);
    
    useEffect(() => {
        if (modals.editor) {
            setEditPrompt('');
            setIsEditing(false);
        }
    }, [modals.editor]);
    
    useEffect(() => {
        if (modals.outfitChanger) {
            // This effect should ONLY run when the modal is opened for the first time in a session.
            if (!outfitChangerOpened.current) {
                const { maleAnchor } = modals.outfitChanger;
                setOutfitActiveTab(maleAnchor ? 'pria' : 'wanita');
                setOutfitChangePrompt('');
                outfitChangerOpened.current = true;
            }
        } else {
            // Reset the flag when the modal is closed, so it re-initializes on next open.
            if (outfitChangerOpened.current) {
                outfitChangerOpened.current = false;
            }
        }
    }, [modals.outfitChanger]);

    const handleApplyEditClick = async () => {
        if (!editPrompt.trim()) return;
        setIsEditing(true);
        await handleApplyEdit(editPrompt);
    };

    const handleOutfitChangeProcess = async () => {
        const modalState = modals.outfitChanger;
        if (!modalState) return;

        const activeAnchor = outfitActiveTab === 'pria' ? modalState.maleAnchor : modalState.femaleAnchor;

        if (!activeAnchor || !outfitChangePrompt.trim()) return;

        const updateStatus = (status: string) => {
             setModals(prev => {
                if (!prev.outfitChanger) return prev;
                return { ...prev, outfitChanger: { ...prev.outfitChanger, isLoading: true, error: status }};
             });
        }
        
        setModals(prev => {
            if (!prev.outfitChanger) return prev;
            const resultProp = outfitActiveTab === 'pria' ? 'maleResultUrl' : 'femaleResultUrl';
            return {
                ...prev,
                outfitChanger: { 
                    ...prev.outfitChanger, 
                    isLoading: true, 
                    error: null, 
                    [resultProp]: null // Clear previous result for this tab
                }
            };
        });

        try {
            const resultUrl = await performApiCall(
                apiKey => changeReferenceOutfit(apiKey, { base64: activeAnchor.base64, mimeType: activeAnchor.mimeType }, outfitChangePrompt, womanStyle), 
                updateStatus
            );
            
            setModals(prev => {
                if (!prev.outfitChanger) return prev;
                const resultProp = outfitActiveTab === 'pria' ? 'maleResultUrl' : 'femaleResultUrl';
                return {
                    ...prev,
                    outfitChanger: {
                        ...prev.outfitChanger,
                        isLoading: false,
                        [resultProp]: resultUrl,
                    }
                };
            });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            setModals(prev => {
                if (!prev.outfitChanger) return prev;
                return {
                    ...prev,
                    outfitChanger: { ...prev.outfitChanger, isLoading: false, error: `Gagal mengubah pakaian: ${errorMessage}` }
                };
            });

            if (errorMessage.startsWith("ALL_KEYS_FAILED:")) {
                 setIsAllKeysFailedModalOpen(true);
            }
        }
    };
    
    const handleEnhanceOutfitPrompt = async () => {
        if (!outfitChangePrompt.trim() || isEnhancingPrompt) return;
        setIsEnhancingPrompt(true);
        try {
            const enhancePrompt = `You are a fashion stylist. Take the following clothing description and enhance it to be more detailed, evocative, and specific for an AI image generator. Output only the enhanced description in Indonesian. Description: "${outfitChangePrompt}"`;
            
            const enhancedText = await performApiCall(
                (apiKey) => generateText(apiKey, enhancePrompt),
                (status) => { /* No status update needed for this quick action */ }
            );
            
            setOutfitChangePrompt(enhancedText);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
             setModals(prev => {
                if (!prev.outfitChanger) return prev;
                return { ...prev, outfitChanger: { ...prev.outfitChanger, error: `Gagal menyempurnakan prompt: ${errorMessage}` }};
             });

             if (errorMessage.startsWith("ALL_KEYS_FAILED:")) {
                 setIsAllKeysFailedModalOpen(true);
            }
        } finally {
            setIsEnhancingPrompt(false);
        }
    };
    
    const handleGetInspiration = () => {
        setIsFetchingInspiration(true);
        try {
            let description = '';
            let subjectPrefix = '';

            if (outfitActiveTab === 'pria') {
                description = getRandomUnique(D.maleClothing, usedOutfits) || 'Gagal mendapatkan ide.';
                subjectPrefix = 'Pria mengenakan';
            } else { // 'wanita'
                const source = womanStyle === 'Berhijab' ? D.femaleClothingHijab : D.femaleClothingNoHijab;
                description = getRandomUnique(source, usedOutfits) || 'Gagal mendapatkan ide.';
                subjectPrefix = 'Wanita mengenakan';
            }
            
            if (description && !description.startsWith('Gagal')) {
                const newPromptPart = `${subjectPrefix} ${description}`;
                setOutfitChangePrompt(prev => prev ? `${prev}. ${newPromptPart}` : newPromptPart);
                setUsedOutfits(prev => new Set(prev).add(description));
            }

        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
             setModals(prev => {
                if (!prev.outfitChanger) return prev;
                return { ...prev, outfitChanger: { ...prev.outfitChanger, error: `Gagal mendapatkan inspirasi: ${errorMessage}` }};
             });
        } finally {
            // Add a small delay to show feedback on the button
            setTimeout(() => setIsFetchingInspiration(false), 300);
        }
    };

    const outfitChangerPlaceholder = outfitActiveTab === 'pria'
        ? "Jelaskan pakaian baru untuk Pria...\nContoh: Pria mengenakan kemeja linen putih dan celana chino krem."
        : `Jelaskan pakaian baru untuk Wanita (${womanStyle})...\nContoh: Wanita mengenakan gaun musim panas berwarna biru muda.`;

    const favoriteCount = generatedImages.filter(img => img.isFavorite).length;
    const buttonBaseClasses = "font-bold py-3 px-6 rounded-lg transition-all duration-200 transform active:scale-95 focus:outline-none focus:ring-4";
    const primaryButtonClasses = `${buttonBaseClasses} bg-[#FF7043] text-white shadow-lg shadow-orange-500/20 hover:bg-opacity-90 focus:ring-orange-500/50`;
    const secondaryButtonClasses = `${buttonBaseClasses} bg-slate-200 text-slate-800 hover:bg-slate-300 focus:ring-slate-300`;
    const destructiveButtonClasses = `${buttonBaseClasses} bg-red-600 text-white shadow-lg shadow-red-500/20 hover:bg-red-700 focus:ring-red-500/50`;

    const outfitChangerModal = modals.outfitChanger;
    const activeAnchor = outfitChangerModal ? (outfitActiveTab === 'pria' ? outfitChangerModal.maleAnchor : outfitChangerModal.femaleAnchor) : null;
    const resultUrl = outfitChangerModal ? (outfitActiveTab === 'pria' ? outfitChangerModal.maleResultUrl : outfitChangerModal.femaleResultUrl) : null;


    return (
        <>
            {modals.error && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="bg-white p-6 rounded-xl shadow-2xl max-w-sm w-full m-4 animate-fade-in-scale-up" onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                             <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                                <svg className="h-6 w-6 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-semibold text-[#0D1B2A] mt-4">Terjadi Kesalahan</h3>
                            <p className="text-sm text-gray-500 mt-2">{modals.error}</p>
                            <button onClick={closeModal} className={`${secondaryButtonClasses} mt-6 w-full text-sm`}>Tutup</button>
                        </div>
                    </div>
                </div>
            )}
            
            {modals.download && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="bg-white p-6 rounded-xl shadow-2xl max-w-sm w-full m-4 animate-fade-in-scale-up" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-bold text-[#0D1B2A] mb-2">Unduh Koleksi</h3>
                        <p className="text-sm text-gray-500 mb-6">Pilih foto mana yang ingin Anda unduh dalam file ZIP.</p>
                        <div className="space-y-4">
                            <button onClick={() => handleDownloadZip(false)} className={`${primaryButtonClasses} w-full text-base`}>
                                Unduh Semua ({generatedImages.length} foto)
                            </button>
                            <button onClick={() => handleDownloadZip(true)} disabled={favoriteCount === 0} className={`${secondaryButtonClasses} w-full text-base disabled:opacity-50 disabled:cursor-not-allowed`}>
                                Unduh Favorit ({favoriteCount} foto)
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {modals.lightbox && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="relative w-full h-full p-4 sm:p-8 flex items-center justify-center animate-fade-in-scale-up" onClick={e => e.stopPropagation()}>
                        <img src={modals.lightbox} alt="Perbesar" className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" />
                        <div className="absolute top-4 right-4 flex gap-2">
                             <button onClick={() => handleDownloadSingle(modals.lightbox as string)} className="p-3 bg-black/50 backdrop-blur-sm rounded-full text-white hover:bg-black/70 transition-colors" title="Unduh Gambar Ini">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            </button>
                            <button onClick={closeModal} className="p-3 bg-black/50 backdrop-blur-sm rounded-full text-white hover:bg-black/70 transition-colors" title="Tutup">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {modals.editor && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="bg-white p-6 rounded-xl shadow-2xl max-w-lg w-full m-4 animate-fade-in-scale-up" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-bold text-[#0D1B2A] mb-2">Editor Cerdas</h3>
                        <p className="text-sm text-gray-500 mb-4">Berikan instruksi sederhana untuk mengubah foto ini.</p>
                        <img src={modals.editor.url} alt="Editing preview" className="w-full rounded-lg mb-4 aspect-[4/5] object-cover bg-gray-100" />
                        <textarea
                            value={editPrompt}
                            onChange={(e) => setEditPrompt(e.target.value)}
                            rows={3}
                            className="w-full bg-slate-100 border border-gray-300 rounded-lg p-3 text-sm text-gray-800 focus:ring-[#FF7043] focus:border-[#FF7043] placeholder-gray-400"
                            placeholder="Contoh: 'Ubah gaun wanita menjadi warna merah', 'Tambahkan awan di langit', dll."
                        />
                        <div className="mt-4 flex gap-4">
                            <button onClick={closeModal} className={`${secondaryButtonClasses} w-1/2 text-sm`}>Batal</button>
                            <button onClick={handleApplyEditClick} disabled={!editPrompt || isEditing} className={`${primaryButtonClasses} w-1/2 text-sm disabled:opacity-50 disabled:cursor-not-allowed`}>
                                {isEditing ? 'Menerapkan...' : 'Terapkan'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {outfitChangerModal && (
                 <div className="modal-overlay" onClick={closeModal}>
                    <div className="bg-white p-6 rounded-xl shadow-2xl max-w-4xl w-full m-4 animate-fade-in-scale-up h-[90vh] flex flex-col relative" onClick={e => e.stopPropagation()}>
                        <button onClick={closeModal} className="absolute top-4 right-4 z-10 p-2 text-gray-400 hover:text-gray-600 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors" title="Tutup">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                        <div className="flex-shrink-0 mb-4">
                            <h3 className="text-xl font-bold text-[#0D1B2A]">Ganti Pakaian Referensi</h3>
                            <p className="text-sm text-gray-500">Ubah pakaian pada foto referensi Anda dengan AI.</p>
                        </div>

                        <div className="flex-grow grid md:grid-cols-2 gap-6 overflow-y-auto custom-scrollbar pr-2 -mr-2">
                            {/* Left Column */}
                            <div className="flex flex-col gap-4">
                                <div className="grid grid-cols-2 gap-4 flex-grow min-h-0">
                                    <div className="flex flex-col">
                                        <p className="text-sm font-semibold text-center mb-2 text-gray-700">Asli</p>
                                        <div className="w-full h-full bg-slate-100 rounded-lg flex items-center justify-center">
                                            {activeAnchor ? (
                                                <img src={activeAnchor.previewUrl} alt="Original reference" className="w-full h-full object-cover rounded-lg bg-gray-100"/>
                                            ) : (
                                                <div className="text-center text-gray-400 p-4">
                                                    <p className="text-xs">Unggah foto referensi untuk '{outfitActiveTab}' di menu utama untuk memulai.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex flex-col">
                                        <p className="text-sm font-semibold text-center mb-2 text-gray-700">Hasil</p>
                                        <div className="w-full h-full bg-slate-100 rounded-lg flex items-center justify-center relative overflow-hidden">
                                        {outfitChangerModal.isLoading ? (
                                            <div className="text-center">
                                                <div className="loader mx-auto"></div>
                                                <p className="text-sm mt-2 text-gray-600">Memproses...</p>
                                            </div>
                                        ) : resultUrl ? (
                                            <img src={resultUrl} alt="Outfit changed result" className="w-full h-full object-cover"/>
                                        ) : (
                                            <div className="text-center text-gray-400 p-4">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                                <p className="text-xs mt-2">Hasil akan muncul di sini.</p>
                                            </div>
                                        )}
                                        </div>
                                    </div>
                                </div>
                                {resultUrl && (
                                    <button onClick={() => handleApplyOutfitChange(outfitActiveTab, resultUrl)} className="w-full mt-2 font-bold py-2.5 px-6 rounded-lg bg-green-600 text-white shadow-lg shadow-green-500/20 hover:bg-green-700 transition-colors">
                                        Gunakan Pakaian Ini
                                    </button>
                                )}
                            </div>
                            
                            {/* Right Column */}
                            <div className="flex flex-col">
                                <div className="flex border-b border-gray-200 mb-4">
                                    <TabButton title="Pria" active={outfitActiveTab === 'pria'} onClick={() => setOutfitActiveTab('pria')} />
                                    <TabButton title="Wanita" active={outfitActiveTab === 'wanita'} onClick={() => setOutfitActiveTab('wanita')} />
                                </div>
                                <div className="relative flex-grow flex flex-col">
                                    <div className="relative">
                                        <textarea
                                            value={outfitChangePrompt}
                                            onChange={(e) => setOutfitChangePrompt(e.target.value)}
                                            rows={8}
                                            className="w-full bg-slate-100 border border-gray-300 rounded-lg p-3 text-sm text-gray-800 focus:ring-[#FF7043] focus:border-[#FF7043] placeholder-gray-400 resize-none"
                                            placeholder={outfitChangerPlaceholder}
                                        />
                                        <button 
                                            onClick={handleEnhanceOutfitPrompt} 
                                            disabled={isEnhancingPrompt || !outfitChangePrompt} 
                                            className="absolute top-2 right-2 text-xs bg-slate-200 text-slate-700 font-semibold py-1.5 px-3 rounded-md hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                                            title="Sempurnakan prompt dengan AI"
                                        >
                                            {isEnhancingPrompt ? <Spinner/> : '✨'} Sempurnakan
                                        </button>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">AI akan mencoba mencocokkan deskripsi Anda dengan tetap mempertahankan wajah subjek.</p>

                                    <div className="mt-auto pt-6 flex flex-col gap-4">
                                         {outfitChangerModal.error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg -mt-2">{outfitChangerModal.error}</p>}
                                        <div className="grid grid-cols-2 gap-4">
                                            <button onClick={handleGetInspiration} disabled={isFetchingInspiration} className="font-bold py-3 px-4 rounded-lg transition-all duration-200 transform active:scale-95 focus:outline-none focus:ring-4 bg-slate-200 text-slate-800 hover:bg-slate-300 focus:ring-slate-300 flex items-center justify-center gap-2 disabled:opacity-50">
                                                ✨ Inspirasi
                                            </button>
                                            <button onClick={handleOutfitChangeProcess} disabled={!outfitChangePrompt || outfitChangerModal.isLoading || !activeAnchor} className="font-bold py-3 px-4 rounded-lg transition-all duration-200 transform active:scale-95 focus:outline-none focus:ring-4 bg-[#FF7043] text-white shadow-lg shadow-orange-500/20 hover:bg-opacity-90 focus:ring-orange-500/50 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                                                {outfitChangerModal.isLoading ? <><Spinner/> Memproses...</> : '🚀 Generate'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                 </div>
            )}

            {isApiModalOpen && (
                <div className="modal-overlay" onClick={() => setIsApiModalOpen(false)}>
                    <div className="bg-white p-6 rounded-xl shadow-2xl max-w-xl w-full m-4 animate-fade-in-scale-up relative" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setIsApiModalOpen(false)} className="absolute top-4 right-4 z-10 p-2 text-gray-400 hover:text-gray-600 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors" title="Tutup">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                        <h3 className="text-xl font-bold text-[#0D1B2A] mb-2">Manajemen Kunci API</h3>
                        <p className="text-sm text-gray-500 mb-4">Kelola Kunci API Google Gemini Anda. Kunci disimpan di browser.</p>
                        
                         {isSystemKeyAvailable && (
                            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                                Kunci sistem {systemKeyOwnerId ? `(${systemKeyOwnerId})` : ''} terdeteksi dan akan digunakan secara otomatis.
                            </div>
                        )}
                        
                        <div className="max-h-48 overflow-y-auto custom-scrollbar pr-2 mb-4 space-y-2">
                             {apiKeys.length === 0 && <p className="text-sm text-gray-500 text-center py-4">Tidak ada kunci yang ditambahkan.</p>}
                             {apiKeys.map(key => (
                                <div key={key.id} className={`p-3 rounded-lg border flex items-center justify-between ${key.isSystem ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="radio"
                                            name="primary-api-key"
                                            checked={primaryApiKeyId === key.id}
                                            onChange={() => setPrimaryApiKeyId(key.id)}
                                            className="h-4 w-4 text-[#FF7043] focus:ring-[#FF7043] border-gray-300"
                                            title="Pilih sebagai kunci utama"
                                        />
                                        <div>
                                            <p className={`font-mono text-sm ${key.isSystem ? 'text-blue-900 font-semibold' : 'text-gray-800'}`}>{key.masked}</p>
                                            <ApiKeyStatusIndicator status={key.status} />
                                        </div>
                                    </div>
                                    {!key.isSystem && (
                                        <button onClick={() => handleRemoveApiKey(key.id)} className="p-1 text-gray-400 hover:text-red-500 rounded-full" title="Hapus Kunci">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        
                        <div className="flex justify-start items-center gap-2 mb-4">
                            <button
                                onClick={() => setPrimaryApiKeyId(null)}
                                className={`text-xs font-semibold py-1 px-3 rounded-md border transition-colors ${primaryApiKeyId === null ? 'bg-[#0D1B2A] text-white border-opacity-0' : 'bg-slate-200 text-slate-700 border-slate-300 hover:bg-slate-300'}`}
                            >
                                Rotasi Otomatis
                            </button>
                             <span className="text-xs text-gray-500">Coba semua kunci secara bergiliran.</span>
                        </div>

                        <div className="space-y-2">
                             <textarea
                                value={apiKeyInput}
                                onChange={e => setApiKeyInput(e.target.value)}
                                rows={3}
                                className="w-full bg-slate-100 border border-gray-300 rounded-lg p-3 text-sm font-mono text-gray-800 focus:ring-[#FF7043] focus:border-[#FF7043] placeholder-gray-400"
                                placeholder="Tambahkan satu atau lebih Kunci API, satu per baris..."
                            />
                            <button onClick={handleSaveApiKeys} disabled={!apiKeyInput} className={`${primaryButtonClasses} w-full text-sm disabled:opacity-50`}>Tambahkan Kunci</button>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-4">
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={handleImportApiKeys} className={`${secondaryButtonClasses} w-full text-sm`}>Impor Kunci</button>
                                <button onClick={handleExportApiKeys} className={`${secondaryButtonClasses} w-full text-sm`}>Ekspor Kunci</button>
                            </div>
                             <div className="grid grid-cols-2 gap-2">
                                <button onClick={handleClearApiKeys} className={`${destructiveButtonClasses} w-full text-sm`}>Hapus Kunci</button>
                                <button onClick={handleValidateKeys} disabled={isKeyValidationLoading} className={`${secondaryButtonClasses} w-full text-sm disabled:opacity-50`}>
                                    {isKeyValidationLoading ? 'Memvalidasi...' : 'Validasi Kunci'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {isAllKeysFailedModalOpen && (
                 <div className="modal-overlay" onClick={() => setIsAllKeysFailedModalOpen(false)}>
                    <div className="bg-white p-6 rounded-xl shadow-2xl max-w-lg w-full m-4 animate-fade-in-scale-up relative" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setIsAllKeysFailedModalOpen(false)} className="absolute top-4 right-4 z-10 p-2 text-gray-400 hover:text-gray-600 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors" title="Tutup">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                                <svg className="h-6 w-6 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            </div>
                            <h3 className="text-lg font-semibold text-[#0D1B2A] mt-4">Semua Kunci API Gagal</h3>
                            <p className="text-sm text-gray-500 mt-2">
                                Sepertinya semua Kunci API Anda tidak valid, kuotanya habis, atau terjadi masalah jaringan. Silakan periksa kunci Anda dan coba lagi.
                            </p>
                            <div className="mt-6 flex gap-4">
                                <button onClick={() => setIsAllKeysFailedModalOpen(false)} className={`${secondaryButtonClasses} w-full text-sm`}>Tutup</button>
                                <button onClick={() => { setIsAllKeysFailedModalOpen(false); setIsApiModalOpen(true); }} className={`${primaryButtonClasses} w-full text-sm`}>
                                    Buka Pengaturan Kunci
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

// --- END: Merged content ---


// --- API Key Manager ---
const API_KEY_STORAGE_KEY = 'ai_photographer_api_keys';
const PRIMARY_KEY_ID_STORAGE_KEY = 'ai_photographer_primary_key_id';


const getStoredApiKeys = (): ApiKey[] => {
    try {
        const stored = localStorage.getItem(API_KEY_STORAGE_KEY);
        if (!stored) return [];

        const parsedJson = JSON.parse(stored);
        
        if (!Array.isArray(parsedJson)) {
            console.error("Stored API keys are not in array format, clearing storage.", parsedJson);
            localStorage.removeItem(API_KEY_STORAGE_KEY);
            return [];
        }

        const keys: Partial<ApiKey>[] = parsedJson;
        
        return keys.map((key, index) => ({
            id: key.id || `key_loaded_${Date.now()}_${index}`,
            value: key.value || '',
            masked: key.masked || (key.value ? `${key.value.slice(0, 4)}...${key.value.slice(-4)}` : ''),
            status: key.status || 'unvalidated', 
            isSystem: false,
        })).filter(key => key.value);

    } catch (e) {
        console.error("Failed to parse API keys from storage, clearing it.", e);
        localStorage.removeItem(API_KEY_STORAGE_KEY);
        return [];
    }
};

const storeApiKeys = (keys: ApiKey[]) => {
    const userKeys = keys.filter(k => !k.isSystem);
    localStorage.setItem(API_KEY_STORAGE_KEY, JSON.stringify(userKeys));
};
// --- End API Key Manager ---

type ColorTone = 'Cerah & Alami' | 'Hangat & Keemasan' | 'Hitam & Putih' | 'Soft & Dreamy' | 'Moody & Cinematic' | 'Vintage & Nostalgic';

// --- Reusable Image Uploader for Face Lock ---
const IdentityAnchorUploader: React.FC<{
    angle: Angle;
    subject: Subject;
    label: string;
    anchor: IdentityAnchorFile | undefined;
    onFileChange: (file: File | null, subject: Subject, angle: Angle) => void;
    onRemove: (subject: Subject, angle: Angle) => void;
    className?: string;
}> = ({ angle, subject, label, anchor, onFileChange, onRemove, className = 'h-32' }) => {
    
    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.currentTarget.classList.remove('border-orange-500');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onFileChange(e.dataTransfer.files[0], subject, angle);
            e.dataTransfer.clearData();
        }
    }, [angle, subject, onFileChange]);

    const handleRemoveClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onRemove(subject, angle);
    };

    return (
        <div className="w-full">
            <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
            <div
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-orange-500'); }}
                onDragLeave={e => e.currentTarget.classList.remove('border-orange-500')}
                className={`relative group flex flex-col items-center justify-center w-full border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-orange-500 transition-colors bg-gray-50 ${className}`}
            >
                {anchor ? (
                    <>
                        <img src={anchor.previewUrl} alt={`${angle} preview`} className="absolute inset-0 w-full h-full object-cover object-top rounded-xl opacity-40" />
                        <div className="relative z-10 text-center p-2 bg-black/50 rounded-lg">
                            <p className="text-xs font-semibold text-white">Terpilih</p>
                        </div>
                        <button 
                            onClick={handleRemoveClick}
                            className="absolute top-1 right-1 z-20 p-0.5 bg-black/50 rounded-full text-white hover:bg-red-500 transition-colors"
                            aria-label="Hapus gambar"
                        >
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </>
                ) : (
                    <div className="text-center p-1">
                         <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                        <p className="text-[10px] text-gray-500 mt-1">Upload Gambar</p>
                    </div>
                )}
                <input type="file" onChange={e => onFileChange(e.target.files?.[0] ?? null, subject, angle)} accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            </div>
        </div>
    );
};

const HijabIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
        <title>Gaya: Berhijab</title>
        <path d="M16.5 2c-1.3 0-2.5.6-3.3 1.5A5.7 5.7 0 0 0 12 5.2c-2.3 0-4.2-1.9-4.2-4.2"/>
        <path d="M12 10a1.4 1.4 0 0 0-1.4 1.4v.1a4.8 4.8 0 0 0 1.5 3.5 4.8 4.8 0 0 0 6.4 0 4.8 4.8 0 0 0 1.5-3.5v-.1A1.4 1.4 0 0 0 18.6 10Z"/>
        <path d="M12 22a4 4 0 0 0 4-4v-3"/>
        <path d="M6.2 14a4.8 4.8 0 0 0 1.5 3.5 4.8 4.8 0 0 0 6.4 0 4.8 4.8 0 0 0 1.5-3.5"/>
        <path d="M4 22a2 2 0 0 1-2-2v-3"/>
    </svg>
);

const HairIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
        <title>Gaya: Tanpa Hijab</title>
        <path d="M2 13s1-2 5-2 5 2 5 2" /><path d="M12 13s1-2 5-2 5 2 5 2" /><path d="M3 7.5c0 0 3-2 6-2s6 2 6 2" /><path d="M10.5 13.5c0 0 1-2 3-2s3 2 3 2" /><path d="M8 7.5s2 3 4 3 4-3 4-3" /><path d="M12 2v3" />
    </svg>
);


const MainApp: React.FC = () => {
    // --- Drive State ---
    const [driveFile, setDriveFile] = useState<any>(null);
    const [driveFileName, setDriveFileName] = useState<string>('MUCI Studio');
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'unsaved'>('idle');
    const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [identityAnchors, setIdentityAnchors] = useState<IdentityAnchorFile[]>([]);
    const [imageCount, setImageCount] = useState(5);
    const [delay, setDelay] = useState(5);
    const [locationTheme, setLocationTheme] = useState('Kehidupan Sehari-hari');
    const [customLocationTheme, setCustomLocationTheme] = useState('');
    const [useCustomTheme, setUseCustomTheme] = useState(false);
    const [colorTone, setColorTone] = useState<ColorTone>('Cerah & Alami');
    const [womanStyle, setWomanStyle] = useState<WomanStyle>('Referensi Photo');
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>('4:5');
    const [cameraShot, setCameraShot] = useState<CameraShot>('Random');
    
    const [selectedNegativePrompts, setSelectedNegativePrompts] = useState<Set<string>>(new Set());
    const [customNegativePrompt, setCustomNegativePrompt] = useState('');

    const [isLoading, setIsLoading] = useState(false);
    const [statusText, setStatusText] = useState('');
    const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
    
    const [modals, setModals] = useState<ModalState>({ error: null, download: false, lightbox: null, editor: null, outfitStudio: false, promptViewer: null, burst: null, creativeDirector: false, promptPreview: null, outfitChanger: null });
    const [isApiModalOpen, setIsApiModalOpen] = useState(false);
    const [isAllKeysFailedModalOpen, setIsAllKeysFailedModalOpen] = useState(false);
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [isKeyValidationLoading, setIsKeyValidationLoading] = useState(false);
    const [activeApiKeyMasked, setActiveApiKeyMasked] = useState<string | null>(null);
    
    const [isEnhancingTheme, setIsEnhancingTheme] = useState(false);
    const [sessionFinished, setSessionFinished] = useState(false);
    const [sessionTargetCount, setSessionTargetCount] = useState(0);
    
    const isGenerationRunningRef = useRef(false);
    const initialKeyCheckDone = useRef(false);
    const apiKeyImportInputRef = useRef<HTMLInputElement>(null);


    // --- New State for Mobile UI ---
    const [isCreationPanelOpen, setIsCreationPanelOpen] = useState(false);

    const [processingImages, setProcessingImages] = useState<Set<string>>(new Set());
    const [favoritesOnly, setFavoritesOnly] = useState(false);
    const [loadingTip, setLoadingTip] = useState(D.loadingScreenTips[0]);
    const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);
    const [primaryApiKeyId, setPrimaryApiKeyId] = useState<string | null>(null);
    const [referenceMode, setReferenceMode] = useState<'separate' | 'couple'>('separate');
    const [sessionStudioDescription, setSessionStudioDescription] = useState<string | null>(null);
    const [customThemeMode, setCustomThemeMode] = useState<'prompt' | 'image'>('prompt');
    const [locationReferenceImage, setLocationReferenceImage] = useState<IdentityAnchorFile | null>(null);

    const getFullSessionState = useCallback(() => {
        return {
            version: '1.1', // Increment version for new structure
            createdAt: new Date().toISOString(),
            identityAnchors,
            generatedImages,
            settings: {
                imageCount, delay, locationTheme, customLocationTheme, useCustomTheme,
                colorTone, womanStyle, aspectRatio, cameraShot,
                selectedNegativePrompts: Array.from(selectedNegativePrompts),
                customNegativePrompt, referenceMode, customThemeMode, locationReferenceImage,
            },
            apiKeys: apiKeys.filter(k => !k.isSystem),
            primaryApiKeyId,
        };
    }, [
        identityAnchors, generatedImages, imageCount, delay, locationTheme, customLocationTheme,
        useCustomTheme, colorTone, womanStyle, aspectRatio, cameraShot, selectedNegativePrompts,
        customNegativePrompt, referenceMode, customThemeMode, locationReferenceImage, apiKeys, primaryApiKeyId
    ]);

    const loadStateFromSession = useCallback((sessionState: any) => {
        if (!sessionState || (sessionState.version !== '1.0' && sessionState.version !== '1.1') || !sessionState.settings) {
            throw new Error("File sesi tidak valid atau formatnya salah.");
        }
        setIdentityAnchors(sessionState.identityAnchors || []);
        setGeneratedImages(sessionState.generatedImages || []);
        
        const { settings } = sessionState;
        setImageCount(settings.imageCount || 5);
        setDelay(settings.delay || 5);
        setLocationTheme(settings.locationTheme || 'Kehidupan Sehari-hari');
        setCustomLocationTheme(settings.customLocationTheme || '');
        setUseCustomTheme(settings.useCustomTheme || false);
        setColorTone(settings.colorTone || 'Cerah & Alami');
        setWomanStyle(settings.womanStyle || 'Referensi Photo');
        setAspectRatio(settings.aspectRatio || '4:5');
        setCameraShot(settings.cameraShot || 'Random');
        setSelectedNegativePrompts(new Set(settings.selectedNegativePrompts || []));
        setCustomNegativePrompt(settings.customNegativePrompt || '');
        setReferenceMode(settings.referenceMode || 'separate');
        setCustomThemeMode(settings.customThemeMode || 'prompt');
        setLocationReferenceImage(settings.locationReferenceImage || null);
        
        const systemApiKey = process.env.API_KEY;
        const systemKeyOwnerId = process.env.SYSTEM_KEY_OWNER_ID;
        const systemKeys: ApiKey[] = [];
        if (systemApiKey) {
            let systemKeyLabel = 'Kunci Sistem (Prioritas Utama)';
            if (systemKeyOwnerId) { systemKeyLabel = `Kunci Sistem (${systemKeyOwnerId})`; }
            systemKeys.push({
                id: 'system_key', value: systemApiKey,
                masked: systemKeyLabel, status: 'unvalidated', isSystem: true
            });
        }

        const userKeysFromSession: ApiKey[] = (sessionState.apiKeys || []).map((k: ApiKey, i: number) => ({
            id: k.id || `session_loaded_${Date.now()}_${i}`,
            value: k.value || '',
            masked: k.masked || (k.value ? `${k.value.slice(0, 4)}...${k.value.slice(-4)}` : ''),
            status: 'unvalidated',
            isSystem: false
        })).filter(k => k.value);
        
        const combinedKeys = [...systemKeys, ...userKeysFromSession];
        setApiKeys(combinedKeys);
        storeApiKeys(combinedKeys);
        setPrimaryApiKeyId(sessionState.primaryApiKeyId || null);

        setToast({ message: 'Sesi berhasil dimuat!', type: 'success' });
    }, []);


    useEffect(() => {
        const bootstrapApp = async () => {
            // --- Drive Integration ---
            // This is the primary loading mechanism. If a Drive file is present,
            // it MUST be loaded. If it fails, we show an error and stop, rather than
            // falling back to local storage and creating a confusing state.
            try {
                // @ts-ignore
                if (window.aistudio?.drive?.getInitialFile) {
                    // @ts-ignore
                    const initialFile = await window.aistudio.drive.getInitialFile();
    
                    if (initialFile) {
                        // A drive file was found, this is the source of truth.
                        try {
                            const sessionState = JSON.parse(initialFile.content);
                            setDriveFile(initialFile.file);
                            setDriveFileName(initialFile.file.name);
                            loadStateFromSession(sessionState); // This function will load everything, including keys
                            setSaveStatus('saved');
                        } catch (parseError) {
                            console.error("Failed to parse session from Drive file:", parseError);
                            setToast({ message: 'Gagal memuat sesi dari Drive. File mungkin rusak.', type: 'error' });
                        }
                        // IMPORTANT: We return here regardless of success or failure in parsing.
                        // If we are in a Drive context, we do not fall back to local storage.
                        return;
                    }
                }
            } catch (driveError) {
                console.error("Error during initial Drive file check:", driveError);
                setToast({ message: `Gagal terhubung ke Google Drive: ${driveError instanceof Error ? driveError.message : 'Unknown error'}`, type: 'error' });
                // Also return here to prevent incorrect fallback.
                return;
            }
    
            // --- Fallback to Local Storage ---
            // This code will ONLY run if no initial Drive file was found.
            const userKeys = getStoredApiKeys();
            const systemApiKey = process.env.API_KEY;
            const systemKeyOwnerId = process.env.SYSTEM_KEY_OWNER_ID;
            const systemKeys: ApiKey[] = [];
            if (systemApiKey) {
                let systemKeyLabel = 'Kunci Sistem (Prioritas Utama)';
                if (systemKeyOwnerId) {
                    systemKeyLabel = `Kunci Sistem (${systemKeyOwnerId})`;
                }
                systemKeys.push({
                    id: 'system_key',
                    value: systemApiKey,
                    masked: systemKeyLabel,
                    status: 'unvalidated',
                    isSystem: true
                });
            }
            setApiKeys([...systemKeys, ...userKeys]);
    
            const storedPrimaryKeyId = localStorage.getItem(PRIMARY_KEY_ID_STORAGE_KEY);
            if (storedPrimaryKeyId) {
                setPrimaryApiKeyId(storedPrimaryKeyId);
            }
        };
    
        bootstrapApp();
    }, [loadStateFromSession]);
    
     // Auto-save effect
    useEffect(() => {
        if (!driveFile || isLoading) return;

        if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
        }
        setSaveStatus('unsaved');

        autoSaveTimeoutRef.current = setTimeout(async () => {
            if (!driveFile) return;
            setSaveStatus('saving');
            try {
                const sessionState = getFullSessionState();
                const content = JSON.stringify(sessionState);
                // @ts-ignore
                await window.aistudio.drive.save(driveFile, content);
                setSaveStatus('saved');
            } catch (error) {
                console.error("Auto-save failed:", error);
                setSaveStatus('error');
                setToast({ message: 'Gagal menyimpan otomatis ke Drive.', type: 'error' });
            }
        }, 1500); // Debounce time

        return () => {
            if (autoSaveTimeoutRef.current) {
                clearTimeout(autoSaveTimeoutRef.current);
            }
        };
    }, [driveFile, getFullSessionState, isLoading]);


     useEffect(() => {
        // Force light theme and clean up storage
        const root = window.document.documentElement;
        root.classList.remove('dark');
        localStorage.removeItem('ai-photographer-theme');
    }, []);
    
    useEffect(() => {
        if (primaryApiKeyId) {
            localStorage.setItem(PRIMARY_KEY_ID_STORAGE_KEY, primaryApiKeyId);
        } else {
            localStorage.removeItem(PRIMARY_KEY_ID_STORAGE_KEY);
        }
    }, [primaryApiKeyId]);

     // Effect for API Key status toast notification on initial load
    useEffect(() => {
        if (initialKeyCheckDone.current || apiKeys.length === 0) return;
        
        const noSystemKey = !process.env.API_KEY;
        const noUserKeys = apiKeys.filter(k => !k.isSystem).length === 0;

        if (noSystemKey && noUserKeys) {
            setToast({ message: 'Tidak ada Kunci API. Silakan tambahkan kunci Anda.', type: 'info' });
            initialKeyCheckDone.current = true;
            return;
        }

        if (apiKeys.length > 0) {
            const systemKey = apiKeys.find(k => k.isSystem);
            if (systemKey) {
                setToast({ message: 'Kunci API Sistem aktif dan siap digunakan.', type: 'success' });
            } else {
                setToast({ message: 'Menggunakan Kunci API pribadi Anda.', type: 'info' });
            }
            initialKeyCheckDone.current = true;
        }
    }, [apiKeys]);
    
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => {
                setToast(null);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [toast]);


    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | null = null;
        if (isLoading) {
            setLoadingTip(shuffleArray(D.loadingScreenTips)[0]); 
            interval = setInterval(() => {
                setLoadingTip(shuffleArray(D.loadingScreenTips)[0]);
            }, 5000);
        }
        return () => {
            if (interval) {
                clearInterval(interval);
            }
        };
    }, [isLoading]);

    const hasApiKeyIssue = useMemo(() => {
        if (apiKeys.length === 0) return true;
        if (primaryApiKeyId) {
            const primaryKey = apiKeys.find(k => k.id === primaryApiKeyId);
            return !primaryKey || primaryKey.status === 'invalid' || primaryKey.status === 'exhausted';
        }
        return apiKeys.every(k => k.status === 'invalid' || k.status === 'exhausted');
    }, [apiKeys, primaryApiKeyId]);


    const performApiCall = async <T,>(apiFunction: (apiKey: string) => Promise<T>, onStatusUpdate: (status: string) => void): Promise<T> => {
        const updateKeyStatus = (keyId: string, newStatus: ApiKeyStatus) => {
            setApiKeys(prev => {
                const updated = prev.map(k => k.id === keyId ? { ...k, status: newStatus } : k);
                storeApiKeys(updated);
                return updated;
            });
        };

        if (primaryApiKeyId) {
            const primaryKey = apiKeys.find(k => k.id === primaryApiKeyId);
            if (primaryKey && (primaryKey.status === 'active' || primaryKey.status === 'unvalidated')) {
                let attempts = 0;
                const maxAttempts = 2;

                while (attempts < maxAttempts) {
                    try {
                        setActiveApiKeyMasked(`Menggunakan Kunci Utama: ${primaryKey.masked}`);
                        const result = await apiFunction(primaryKey.value);
                        if (primaryKey.status === 'unvalidated') {
                            updateKeyStatus(primaryKey.id, 'active');
                        }
                        return result;
                    } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : String(error);

                        if (errorMessage.includes('API key not valid')) {
                            updateKeyStatus(primaryKey.id, 'invalid');
                            throw new Error(`Kunci utama yang dipilih tidak valid. Silakan pilih kunci lain atau gunakan rotasi otomatis.`);
                        }
                        if (errorMessage.includes("SAFETY_BLOCK")) {
                             throw new Error(`Permintaan diblokir karena kebijakan keamanan. Coba ubah prompt Anda.`);
                        }
                        if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
                            attempts++;
                            if (attempts < maxAttempts) {
                                const delaySeconds = 20;
                                onStatusUpdate(`Kunci utama mencapai batas kuota. Mencoba lagi dalam ${delaySeconds} detik...`);
                                await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
                                onStatusUpdate(`Mencoba kembali dengan kunci utama...`);
                                continue;
                            } else {
                                updateKeyStatus(primaryKey.id, 'exhausted');
                                throw new Error(`Kunci utama yang dipilih kuotanya habis setelah dicoba kembali. Silakan pilih kunci lain atau gunakan rotasi otomatis.`);
                            }
                        }
                        throw new Error(`Terjadi kesalahan pada kunci utama yang dipilih: ${errorMessage}`);
                    }
                }
            } else {
                throw new Error(`Kunci utama yang dipilih tidak dapat digunakan (mungkin tidak valid atau kuota habis). Beralih ke mode Rotasi Otomatis atau pilih kunci lain.`);
            }
        }

        const availableKeys = apiKeys.filter(k => k.status === 'active' || k.status === 'unvalidated');
    
        if (availableKeys.length === 0) {
            setActiveApiKeyMasked(null);
            throw new Error("ALL_KEYS_FAILED: Tidak ada kunci API yang aktif. Silakan tambahkan kunci API Anda sendiri untuk menggunakan aplikasi ini.");
        }
    
        for (const keyToTry of availableKeys) {
            let attempts = 0;
            const maxAttempts = 2; 
    
            while (attempts < maxAttempts) {
                try {
                    setActiveApiKeyMasked(`Menggunakan: ${keyToTry.masked}`);
                    const result = await apiFunction(keyToTry.value);
    
                    if (keyToTry.status === 'unvalidated') {
                        updateKeyStatus(keyToTry.id, 'active');
                    }
    
                    return result;
    
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
    
                    if (errorMessage.includes('API key not valid')) {
                        console.warn(`API key ${keyToTry.masked} is invalid.`);
                        updateKeyStatus(keyToTry.id, 'invalid');
                        break;
                    }

                    if (errorMessage.includes("SAFETY_BLOCK")) {
                        console.error(`Request blocked due to safety settings for key ${keyToTry.masked}.`, error);
                        throw new Error(`Permintaan diblokir karena kebijakan keamanan. Coba ubah prompt Anda.`);
                    }
    
                    if ((errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED'))) {
                        attempts++;
                        if (attempts < maxAttempts) {
                            const delaySeconds = 20; 
                            console.warn(`API key ${keyToTry.masked} hit a rate limit. Retrying in ${delaySeconds} seconds...`);
                            
                            onStatusUpdate(`Batas kuota tercapai. Mencoba lagi dalam ${delaySeconds} detik...`);
                            await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
                            onStatusUpdate(`Mencoba kembali...`);
                            continue;
                        } else {
                             console.error(`API call failed for key ${keyToTry.masked} after retry.`, error);
                             updateKeyStatus(keyToTry.id, 'exhausted');
                             break;
                        }
                    }
    
                    console.error(`API call failed for key ${keyToTry.masked}.`, error);
                    break; 
                }
            }
        } 
    
        setActiveApiKeyMasked(null);
        throw new Error("ALL_KEYS_FAILED: Semua kunci API yang tersedia gagal atau kuotanya habis. Periksa kunci Anda atau coba lagi nanti.");
    };

    const locationGroups: Record<string, string[]> = useMemo(() => ({
        "Studio & Konsep": [
            "Studio Minimalis (Latar Putih)", "Studio Latar Warna Solid", "Studio Konsep Bohemian", "Studio Tema Bunga & Tanaman",
            "Studio Industrial (Dinding Bata)", "Studio Konsep Rumahan (Cozy)", "Studio Tema Vintage & Retro", "Studio Gelap & Moody (Low Key)",
            "Studio dengan Properti Unik", "Studio Proyeksi & Neon Light"
        ],
        "Indonesia": ["Kehidupan Sehari-hari", "Kisah Kampus", "Pasar Tradisional", "Kota Tua", "Toko Batik", "Pedesaan", "Hutan Tropis", "Street Food", "Bali", "Yogyakarta", "Bromo", "Raja Ampat", "Sumba", "Danau Toba"],
        "Asia Pasifik": ["Tokyo", "Kyoto", "Nara (Jepang)", "Seoul (Korea)", "Thailand", "Vietnam", "Singapura", "Selandia Baru", "Australia"],
        "Eropa": ["Paris", "Santorini", "Roma", "Venesia", "London", "Praha", "Tuscany", "Swiss", "Islandia"],
        "Amerika & Timur Tengah": ["New York City", "Grand Canyon", "California", "Cappadocia (Turki)", "Dubai", "Maroko"],
    }), []);

    const handleAnchorFileChange = (file: File | null, subject: Subject, angle: Angle) => {
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const previewUrl = e.target?.result as string;
                const [header, base64] = previewUrl.split(',');
                const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
                
                const newAnchor: IdentityAnchorFile = { id: `${subject}-${angle}-${Date.now()}`, subject, angle, base64, mimeType, previewUrl };

                if (subject === 'pasangan') {
                    setIdentityAnchors([newAnchor]);
                } else {
                    setIdentityAnchors(prev => [...prev.filter(a => !(a.subject === subject && a.angle === angle)), newAnchor]);
                }
            };
            reader.readAsDataURL(file);
        }
    };
    
    const handleLocationReferenceChange = (file: File | null) => {
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const previewUrl = e.target?.result as string;
                const [header, base64] = previewUrl.split(',');
                const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
                setLocationReferenceImage({ id: `location-${Date.now()}`, subject: 'pasangan', angle: 'depan', base64, mimeType, previewUrl });
            };
            reader.readAsDataURL(file);
        }
    };
    
    const handleRemoveLocationReference = () => {
        setLocationReferenceImage(null);
    };

    const handleRemoveAnchorFile = (subject: Subject, angle: Angle) => {
        if (subject === 'pasangan') {
            setIdentityAnchors([]);
        } else {
            setIdentityAnchors(prev => prev.filter(a => !(a.subject === subject && a.angle === angle)));
        }
    };

    const handleEnhanceCustomTheme = async () => {
        if (!customLocationTheme.trim() || isEnhancingTheme) return;
        setIsEnhancingTheme(true);
        try {
            const enhancedTheme = await performApiCall(apiKey => enhanceLocationTheme(apiKey, customLocationTheme), setStatusText);
            setCustomLocationTheme(enhancedTheme);
            setToast({ message: 'Tema kustom berhasil ditingkatkan!', type: 'success' });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.startsWith("ALL_KEYS_FAILED:")) {
                setIsAllKeysFailedModalOpen(true);
            } else {
                setModals(prev => ({...prev, error: `Gagal meningkatkan tema: ${errorMessage}`}));
            }
        } finally {
            setIsEnhancingTheme(false);
            setActiveApiKeyMasked(null);
        }
    };

    const toggleNegativePrompt = (tag: string) => {
        setSelectedNegativePrompts(prev => {
            const newSet = new Set(prev);
            newSet.has(tag) ? newSet.delete(tag) : newSet.add(tag);
            return newSet;
        });
    };
    
    const handleToggleAllNegativePrompts = () => {
        if (selectedNegativePrompts.size === D.negativePromptOptions.length) {
            setSelectedNegativePrompts(new Set());
        } else {
            setSelectedNegativePrompts(new Set(D.negativePromptOptions));
        }
    };

    const handleOpenOutfitChanger = () => {
        const maleAnchor = identityAnchors.find(a => a.subject === 'pria' && a.angle === 'depan') || null;
        const femaleAnchor = identityAnchors.find(a => a.subject === 'wanita' && a.angle === 'depan') || null;
    
        if (!maleAnchor && !femaleAnchor) {
            setModals(prev => ({ ...prev, error: 'Harap unggah setidaknya satu foto referensi (Pria atau Wanita) tampak depan.' }));
            return;
        }
    
        setModals(prev => ({ 
            ...prev, 
            outfitChanger: { 
                maleAnchor, 
                femaleAnchor, 
                isLoading: false, 
                maleResultUrl: null,
                femaleResultUrl: null,
                error: null 
            } 
        }));
    };
    
    const handleApplyOutfitChange = (subject: 'pria' | 'wanita', newImageUrl: string) => {
        const [header, base64] = newImageUrl.split(',');
        const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';

        // Update the main anchor list
        setIdentityAnchors(prev => prev.map(anchor => 
            (anchor.subject === subject && anchor.angle === 'depan') 
            ? { ...anchor, base64, mimeType, previewUrl: newImageUrl } 
            : anchor
        ));
        
        // Update the modal's state without closing it
        setModals(prev => {
            if (!prev.outfitChanger) return prev;

            const originalAnchor = subject === 'pria' ? prev.outfitChanger.maleAnchor : prev.outfitChanger.femaleAnchor;
            
            // This should not happen if the button is visible, but as a safeguard.
            if (!originalAnchor) return prev; 
            
            const updatedAnchor: IdentityAnchorFile = { 
                ...originalAnchor,
                base64, 
                mimeType, 
                previewUrl: newImageUrl 
            };

            return {
                ...prev,
                outfitChanger: {
                    ...prev.outfitChanger,
                    maleAnchor: subject === 'pria' ? updatedAnchor : prev.outfitChanger.maleAnchor,
                    femaleAnchor: subject === 'wanita' ? updatedAnchor : prev.outfitChanger.femaleAnchor,
                    maleResultUrl: subject === 'pria' ? null : prev.outfitChanger.maleResultUrl,
                    femaleResultUrl: subject === 'wanita' ? null : prev.outfitChanger.femaleResultUrl,
                    error: null, // Clear any previous error
                }
            };
        });

        setToast({ message: `Foto referensi ${subject === 'pria' ? 'Pria' : 'Wanita'} telah diperbarui.`, type: 'success'});
    };
    
    const runGeneration = async (isContinuation = false, overrideCount?: number) => {
        if (isGenerationRunningRef.current) return;
        
        setIsCreationPanelOpen(false);
    
        if (referenceMode === 'separate' && (!identityAnchors.find(a => a.subject === 'pria' && a.angle === 'depan') || !identityAnchors.find(a => a.subject === 'wanita' && a.angle === 'depan'))) {
            setModals(prev => ({ ...prev, error: 'Mode Foto Terpisah: Harap unggah foto tampak depan untuk Pria dan Wanita.' }));
            return;
        }
        if (referenceMode === 'couple' && identityAnchors.length === 0) {
             setModals(prev => ({ ...prev, error: 'Mode Foto Pasangan: Harap unggah satu foto pasangan.' }));
            return;
        }
        
        const effectiveLocationTheme = useCustomTheme && customThemeMode === 'prompt' ? customLocationTheme.trim() : locationTheme;
        if (useCustomTheme && customThemeMode === 'prompt' && !effectiveLocationTheme) {
            setModals(prev => ({ ...prev, error: 'Harap masukkan tema lokasi kustom Anda.' }));
            return;
        }
         if (useCustomTheme && customThemeMode === 'image' && !locationReferenceImage) {
            setModals(prev => ({ ...prev, error: 'Harap unggah gambar referensi lokasi.' }));
            return;
        }
    
        isGenerationRunningRef.current = true;
        setIsLoading(true);
        const countForThisRun = overrideCount ?? imageCount;

        if (!isContinuation) {
            generatedImages.forEach(img => {
                if (img.url.startsWith('blob:')) {
                    URL.revokeObjectURL(img.url);
                }
            });
            setGeneratedImages([]);
            setSessionFinished(false);
            setSessionTargetCount(countForThisRun);
            setSessionStudioDescription(null); 
        } else if (!overrideCount) { 
            setSessionTargetCount(prev => prev + countForThisRun);
        }
    
        let scenarios: { scene: string; emotion: string }[] = [];
    
        try {
            let studioDescForSession: string | null = null;
            const finalLocationTheme = useCustomTheme ? (customThemeMode === 'image' ? "Dari gambar referensi" : customLocationTheme) : locationTheme;
            const isStudioTheme = locationGroups["Studio & Konsep"].includes(finalLocationTheme);

            if (!isContinuation && isStudioTheme) {
                try {
                    setStatusText('Mendesain studio virtual...');
                    studioDescForSession = await performApiCall(apiKey => generateStudioSetDescription(apiKey, finalLocationTheme), setStatusText);
                    setSessionStudioDescription(studioDescForSession);
                } catch (error) {
                    console.warn("Gagal membuat deskripsi studio, akan melanjutkan dengan latar belakang dinamis.", error);
                    setToast({ message: 'Gagal membuat set studio, latar akan bervariasi.', type: 'info' });
                }
            } else if (isContinuation && isStudioTheme) {
                studioDescForSession = sessionStudioDescription;
            }

            if (useCustomTheme) {
                setStatusText('Menggunakan skenario kustom...');
                const customEmotion = customThemeMode === 'image' ? "Sesuai dengan suasana gambar referensi." : "Sesuai deskripsi kustom yang diberikan.";
                const customScenario = { scene: finalLocationTheme, emotion: customEmotion };
                scenarios = Array(countForThisRun).fill(customScenario);
            } else {
                const scenarioStatus = `Membuat skenario kreatif untuk ${finalLocationTheme}...`;
                setStatusText(scenarioStatus);
                try {
                    scenarios = await performApiCall(apiKey => generateLocationBasedScenarios(apiKey, finalLocationTheme, countForThisRun), setStatusText);
                } catch (error) {
                     console.warn("Creative scenario generation failed. Falling back to generic scenarios.", error);
                     setStatusText(`Skenario kreatif gagal, menggunakan skenario cadangan...`);
                     const fallbackScenarios = [
                        { scene: "A couple shares a candid laugh while sharing coffee at a small, cozy café.", emotion: "Joyful intimacy" }, { scene: "Walking hand-in-hand along a misty forest path at dawn.", emotion: "Serene connection" },
                        { scene: "A surprise proposal scene under blooming cherry blossoms in a quiet park.", emotion: "Overwhelming happiness" }, { scene: "An intimate kitchen moment, playfully baking together with flour on their noses.", emotion: "Playful affection" },
                        { scene: "Watching the city lights from a rooftop balcony, wrapped in a shared blanket.", emotion: "Quiet contentment" }, { scene: "A farewell moment at a vintage train station, promising to return.", emotion: "Bittersweet romance" },
                     ];
                     let generatedFallbackScenarios = [];
                     const shuffledFallbacks = shuffleArray(fallbackScenarios);
                     for (let i = 0; i < countForThisRun; i++) {
                        generatedFallbackScenarios.push(shuffledFallbacks[i % shuffledFallbacks.length]);
                     }
                     scenarios = generatedFallbackScenarios;
                }
            }
            
            if (scenarios.length < countForThisRun) {
                const fallback = { scene: 'The couple shares a quiet, intimate moment.', emotion: 'A feeling of deep connection.' };
                scenarios.push(...Array(countForThisRun - scenarios.length).fill(fallback));
            }
            
            setStatusText(`Persiapan selesai. Memulai sesi foto...`);
            await new Promise(resolve => setTimeout(resolve, 1500));

            const colorToneMap: Record<ColorTone, string> = {
                'Cerah & Alami': 'A bright and airy look with soft, diffused daylight. **Crucially, maintain a neutral to cool white balance for true-to-life skin tones and pure whites.** Avoid strong yellow, orange, or golden casts. Emphasize natural colors without oversaturation for a clean, professional DSLR aesthetic. The overall mood should feel fresh and natural, not warm or vintage.',
                'Hangat & Keemasan': '**CRITICAL INSTRUCTION: The final image MUST have a warm, golden hour lighting effect with a romantic, amber glow.** Avoid cool or neutral tones. The entire scene must be bathed in warm, golden light.',
                'Hitam & Putih': '**CRITICAL INSTRUCTION: The final image MUST be in high-contrast black and white.** This is a non-negotiable requirement. Do not generate any color in the image.',
                'Soft & Dreamy': 'Create a soft, dreamy, and ethereal look with a pastel color palette. Use a slight haze or bloom effect to enhance the romantic atmosphere. Colors should be desaturated and light.',
                'Moody & Cinematic': 'Generate a moody, cinematic look with deep shadows, rich contrast, and desaturated colors. The lighting should be dramatic, like a scene from a film noir or an indie movie. Emphasize texture and emotion over brightness.',
                'Vintage & Nostalgic': 'Apply a vintage film aesthetic, similar to an old photograph from the 7s or 80s. Use a warm, slightly sepia or faded color cast, add subtle film grain, and slightly reduce sharpness to create a nostalgic, timeless feel.'
            };
            const colorToneInstruction = colorToneMap[colorTone];
            
            for (let i = 0; i < countForThisRun; i++) {
                if (!isGenerationRunningRef.current) break;
            
                const scenario = scenarios[i % scenarios.length];
                
                const baseNegativePrompts = ['white border', 'frame', 'polaroid', 'text', 'watermark'];
                const combinedNegativePrompts = [...baseNegativePrompts, ...Array.from(selectedNegativePrompts), ...customNegativePrompt.split(',').map(s => s.trim()).filter(Boolean)];
                const negativePrompt = [...new Set(combinedNegativePrompts)].join(', ');
            
                const photoStyle = "a cinematic wide shot like a movie scene";
                const styleAndColorInstruction = `- Style: ${photoStyle}\n- Color & Tone: ${colorToneInstruction}`;
                let negativePromptInstruction = negativePrompt ? `\n- **Prohibited Content (Strictly Avoid):** The image must NOT contain any of the following elements: ${negativePrompt}.` : '';
                negativePromptInstruction += `\n- **Pose Constraint (Strictly Follow):** The couple must NOT be kissing on the lips or face. Poses can be intimate and romantic (like holding hands, hugging, leaning on each other), but must absolutely avoid any form of mouth-to-mouth or mouth-to-cheek kissing.`;

                setStatusText(`Menghasilkan gambar ${i + 1} dari ${countForThisRun}...`);

                try {
                    let url: string;
                    
                    const onUpdateForApiCall = (status: string) => setStatusText(`Gambar ${i + 1}/${countForThisRun} | ${status}`);

                    const shotForThisRun = cameraShot === 'Random' ? (['Full Body Shot', 'Medium Shot'] as const)[Math.floor(Math.random() * 2)] : cameraShot;
                    const details: GenerationDetails = { scenarioScene: scenario.scene, scenarioEmotion: scenario.emotion, locationTheme: finalLocationTheme, styleAndColorInstruction, negativePromptInstruction, womanStyle, studioDescription: studioDescForSession || undefined, aspectRatio, cameraShot: shotForThisRun };
                    
                    const locationRef = (useCustomTheme && customThemeMode === 'image') ? locationReferenceImage : null;
                    url = await performApiCall(apiKey => generatePhotoFromReference(apiKey, identityAnchors, details, locationRef), onUpdateForApiCall);

                    if (!isGenerationRunningRef.current) break;

                    setStatusText(`Menyesuaikan gambar ${i + 1}/${countForThisRun}...`);
                    const imageBlob = await fetch(url).then(res => res.blob());
                    const aspectRatioValue = { '4:5': 4 / 5, '1:1': 1, '16:9': 16 / 9 }[aspectRatio];
                    const croppedBlob = await cropImage(imageBlob, aspectRatioValue);
                    const croppedUrl = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.onerror = reject;
                        reader.readAsDataURL(croppedBlob);
                    });
                    
                    const creativeDetailsForPrompt = {
                        locationTheme: finalLocationTheme,
                        scenarioScene: scenario.scene,
                        scenarioEmotion: scenario.emotion,
                        colorTone,
                        womanStyle,
                        aspectRatio,
                        cameraShot: shotForThisRun,
                        clothing: womanStyle === 'Referensi Photo' ? 'Mengikuti pakaian dari foto referensi' : 'Dihasilkan oleh AI berdasarkan gaya',
                        studioDescription: studioDescForSession || undefined,
                        negativePrompt: negativePrompt,
                    };

                    const newImage: GeneratedImage = { id: generateRandomFilename(), url: croppedUrl, prompt: JSON.stringify(creativeDetailsForPrompt, null, 2), isFavorite: false };
                    setGeneratedImages(prevImages => [...prevImages, newImage]);
                    
                } catch (error) {
                    console.error(`Gagal menghasilkan gambar ke-${i + 1}:`, error);
                }

                if (isGenerationRunningRef.current && i < countForThisRun - 1 && delay > 0) {
                    setStatusText(`Jeda ${delay} detik sebelum gambar berikutnya...`);
                    await new Promise(resolve => setTimeout(resolve, delay * 1000));
                }
            }

            if (!isGenerationRunningRef.current) {
                throw new Error("Proses dihentikan oleh pengguna.");
            }
    
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.startsWith("ALL_KEYS_FAILED:")) {
                setIsAllKeysFailedModalOpen(true);
            } else if (!errorMessage.includes("Proses dihentikan")) {
                setModals(prev => ({ ...prev, error: `Sesi foto gagal: ${errorMessage}` }));
            }
        } finally {
            if (isGenerationRunningRef.current) {
                setStatusText("Sesi foto selesai!");
                setToast({ message: "Sesi foto selesai!", type: 'success' });
            } else {
                setStatusText("Proses dihentikan.");
            }
            setIsLoading(false);
            isGenerationRunningRef.current = false;
            setSessionFinished(true);
            setActiveApiKeyMasked(null);
        }
    };
    
    const handleDeleteImage = (idToDelete: string) => {
        setGeneratedImages(prevImages => {
            const imageToDelete = prevImages.find(img => img.id === idToDelete);
            if (imageToDelete && imageToDelete.url.startsWith('blob:')) {
                URL.revokeObjectURL(imageToDelete.url);
            }
            return prevImages.filter(img => img.id !== idToDelete);
        });
    };

    const runSingleImageGeneration = async (imageIdToUpdate: string, generationPrompt: string, referenceImgs?: IdentityAnchorFile[] | null) => {
        setProcessingImages(prev => new Set(prev).add(imageIdToUpdate));
        try {
            const imageUrl = await performApiCall(apiKey => generateImage(apiKey, generationPrompt, referenceImgs || undefined), () => {});
            setGeneratedImages(prev => prev.map(img => img.id === imageIdToUpdate ? { ...img, url: imageUrl, prompt: generationPrompt } : img));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.startsWith("ALL_KEYS_FAILED:")) {
                setIsAllKeysFailedModalOpen(true);
            } else {
                setModals(prev => ({ ...prev, error: `Gagal memproses gambar: ${errorMessage}` }));
            }
        } finally {
            setProcessingImages(prev => {
                const newSet = new Set(prev);
                newSet.delete(imageIdToUpdate);
                return newSet;
            });
            setActiveApiKeyMasked(null);
        }
    };

    const handleToggleFavorite = (id: string) => {
        setGeneratedImages(prev => prev.map(img => img.id === id ? { ...img, isFavorite: !img.isFavorite } : img));
    };

    const handleVariations = async (image: GeneratedImage) => {
        if (processingImages.has(image.id)) return;
        setProcessingImages(prev => new Set(prev).add(image.id));
        try {
            const blob = await fetch(image.url).then(res => res.blob());
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                const [header, base64] = result.split(',');
                const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
                const variationPrompt = `Based on the provided reference image, generate a new, slightly different creative variation. Keep the couple's appearance, clothing, and overall theme identical, but introduce a subtle change in their pose, expression, or the camera angle.`;
                const tempAnchor: IdentityAnchorFile = { id: `var-${image.id}`, subject: 'pasangan', angle: 'depan', base64, mimeType, previewUrl: image.url };
                runSingleImageGeneration(image.id, variationPrompt, [tempAnchor]);
            };
            reader.readAsDataURL(blob);
        } catch (error) {
            console.error("Error creating variation:", error);
            setModals(prev => ({ ...prev, error: `Gagal membuat variasi: ${error instanceof Error ? error.message : 'Unknown error'}` }));
            setProcessingImages(prev => {
                const newSet = new Set(prev);
                newSet.delete(image.id);
                return newSet;
            });
        }
    };

    const handleGenerateBurstImage = async (originalImage: GeneratedImage): Promise<string> => {
        const prompt = originalImage.prompt;
        const onUpdate = (status: string) => console.log(`Burst generation status: ${status}`);
        return performApiCall(apiKey => generateImage(apiKey, prompt, identityAnchors || undefined), onUpdate);
    };

    const handleSelectBurstWinner = (originalImageId: string, newImageUrl: string) => {
        setGeneratedImages(prev => prev.map(img => img.id === originalImageId ? { ...img, url: newImageUrl } : img));
        setModals(prev => ({ ...prev, burst: null }));
    };

    const handleApplyEdit = async (editInstruction: string) => {
        const imageToEdit = modals.editor;
        if (!imageToEdit || processingImages.has(imageToEdit.id) || !editInstruction) return;
        const blob = await fetch(imageToEdit.url).then(res => res.blob());
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
            const result = reader.result as string;
            const [header, base64] = result.split(',');
            const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
            const editPrompt = `Using the provided image as a base, perform ONLY the following edit: "${editInstruction}". Maintain the original style, quality, and composition. Only change what is requested and keep the rest of the image identical. Output the edited image directly.`;
            const tempAnchor: IdentityAnchorFile = { id: `edit-${imageToEdit.id}`, subject: 'pasangan', angle: 'depan', base64, mimeType, previewUrl: imageToEdit.url };
            runSingleImageGeneration(imageToEdit.id, editPrompt, [tempAnchor]);
        };
        setModals(prev => ({ ...prev, editor: null }));
    };

    const handleStop = () => {
        isGenerationRunningRef.current = false;
        setStatusText("Menghentikan proses...");
        setActiveApiKeyMasked(null);
    }
    
    const handleDownloadZip = async (onlyFavorites = false) => {
        setModals(prev => ({...prev, download: false}));
        const zip = new JSZip();
        const imagesToDownload = onlyFavorites ? generatedImages.filter(img => img.isFavorite) : generatedImages;
    
        for (const image of imagesToDownload) {
            try {
                const response = await fetch(image.url);
                const blob = await response.blob();
                zip.file(generateRandomFilename('prewedding', 'jpeg'), blob);
            } catch (e) {
                console.error("Failed to process image for download:", image.url, e);
            }
        }
        
        const zipFileName = onlyFavorites ? 'MUCI_favorites' : 'MUCI_collection';
        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, generateRandomFilename(zipFileName, 'zip'));
    };
    
    const handleDownloadSingle = (url: string) => {
        saveAs(url, generateRandomFilename('MUCI_photo', 'jpeg'));
    };
    
    const handleClearAll = () => {
        generatedImages.forEach(img => {
            if (img.url.startsWith('blob:')) {
                URL.revokeObjectURL(img.url);
            }
        });
        setGeneratedImages([]);
        setSessionFinished(false);
        setSessionTargetCount(0);
        setStatusText('');
        setFavoritesOnly(false);
        setSessionStudioDescription(null);
    };

    const handleExtractPrompts = () => {
        const imagesToExtract = favoritesOnly ? generatedImages.filter(img => img.isFavorite) : generatedImages;

        if (imagesToExtract.length === 0) {
            setToast({ message: 'Tidak ada data prompt untuk diekstrak.', type: 'info' });
            return;
        }

        const extractionData = imagesToExtract.map(image => {
            let promptDetails;
            try {
                promptDetails = JSON.parse(image.prompt);
            } catch (e) {
                promptDetails = { raw_prompt: image.prompt }; // Fallback for non-JSON prompts
            }
            return {
                image_id: image.id,
                prompt_details: promptDetails,
            };
        });

        const jsonString = JSON.stringify(extractionData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
        const filename = favoritesOnly ? 'MUCI_prompts_favorites.json' : 'MUCI_prompts_all.json';
        saveAs(blob, filename);
    };

    const handleSaveApiKeys = () => {
        const keysFromInput = apiKeyInput.split('\n').map(k => k.trim()).filter(Boolean);
        if (keysFromInput.length === 0) return;

        const existingValues = new Set(apiKeys.map(k => k.value));
        const newApiKeys: ApiKey[] = keysFromInput
            .filter(k => !existingValues.has(k)) 
            .map(k => ({ id: `key_${Date.now()}_${Math.random()}`, value: k, masked: `${k.slice(0, 4)}...${k.slice(-4)}`, status: 'unvalidated', isSystem: false }));

        const updatedKeys = [...apiKeys, ...newApiKeys];
        setApiKeys(updatedKeys);
        storeApiKeys(updatedKeys);
        setApiKeyInput('');
    };

    const handleValidateKeys = async () => {
        if (isKeyValidationLoading || apiKeys.length === 0) return;
        setIsKeyValidationLoading(true);
        const validationPromises = apiKeys.map(async (key) => ({ ...key, status: await validateApiKey(key.value) }));
        const updatedKeys = await Promise.all(validationPromises);
        setApiKeys(updatedKeys);
        storeApiKeys(updatedKeys);
        setIsKeyValidationLoading(false);
    };

    const handleRemoveApiKey = (idToRemove: string) => {
        const newKeys = apiKeys.filter(k => k.id !== idToRemove);
        setApiKeys(newKeys);
        storeApiKeys(newKeys);
        if (primaryApiKeyId === idToRemove) {
            setPrimaryApiKeyId(null);
        }
    };
    
    const handleClearApiKeys = () => {
        const systemKeys = apiKeys.filter(k => k.isSystem);
        setApiKeys(systemKeys);
        storeApiKeys(systemKeys);
        setPrimaryApiKeyId(null);
    };
    
    const handleExportApiKeys = () => {
        try {
            const userKeys = apiKeys.filter(k => !k.isSystem);
            if (userKeys.length === 0) {
                setToast({ message: 'Tidak ada kunci untuk diekspor.', type: 'info' });
                return;
            }
            const blob = new Blob([JSON.stringify(userKeys, null, 2)], { type: 'application/json' });
            saveAs(blob, 'MUCI_api_keys.json');
            setToast({ message: 'Kunci API berhasil diekspor!', type: 'success' });
        } catch (error) {
            setToast({ message: `Gagal mengekspor kunci: ${error instanceof Error ? error.message : 'Unknown error'}`, type: 'error' });
        }
    };

    const handleApiKeyFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result;
                if (typeof text !== 'string') throw new Error("Gagal membaca file.");
                const importedKeys: Partial<ApiKey>[] = JSON.parse(text);

                if (!Array.isArray(importedKeys)) throw new Error("Format file tidak valid.");
                
                const existingKeyValues = new Set(apiKeys.map(k => k.value));
                const newUniqueKeys: ApiKey[] = importedKeys
                    .filter(k => k && typeof k.value === 'string' && !existingKeyValues.has(k.value))
                    .map((k, i) => ({
                        id: k.id || `imported_${Date.now()}_${i}`,
                        value: k.value!,
                        masked: k.masked || `${k.value!.slice(0, 4)}...${k.value!.slice(-4)}`,
                        status: 'unvalidated',
                        isSystem: false
                    }));
                
                if (newUniqueKeys.length > 0) {
                    const updatedKeys = [...apiKeys, ...newUniqueKeys];
                    setApiKeys(updatedKeys);
                    storeApiKeys(updatedKeys);
                    setToast({ message: `${newUniqueKeys.length} kunci baru berhasil diimpor.`, type: 'success' });
                } else {
                    setToast({ message: 'Tidak ada kunci baru untuk diimpor atau kunci sudah ada.', type: 'info' });
                }

            } catch (error) {
                setToast({ message: `Gagal mengimpor kunci: ${error instanceof Error ? error.message : 'File tidak valid.'}`, type: 'error' });
            } finally {
                if (apiKeyImportInputRef.current) {
                    apiKeyImportInputRef.current.value = "";
                }
            }
        };
        reader.readAsText(file);
    };

    const handleImportApiKeys = () => {
        apiKeyImportInputRef.current?.click();
    };

    const handleDriveOpen = async () => {
        try {
            // @ts-ignore
            const selectedFile = await window.aistudio.drive.open();
            if (selectedFile) {
                if (!window.confirm("Membuka file baru akan menimpa pekerjaan Anda saat ini. Lanjutkan?")) {
                    return;
                }
                setDriveFile(selectedFile.file);
                setDriveFileName(selectedFile.file.name);
                loadStateFromSession(JSON.parse(selectedFile.content));
                setSaveStatus('saved');
            }
        } catch (error) {
            console.error("Error opening file from Drive:", error);
            setToast({ message: `Gagal membuka file dari Drive: ${error instanceof Error ? error.message : 'Unknown error'}`, type: 'error' });
        }
    };
    
    const handleDriveSave = async () => {
        if (!driveFile) {
            handleDriveSaveAs();
            return;
        }
        setSaveStatus('saving');
        try {
            const sessionState = getFullSessionState();
            const content = JSON.stringify(sessionState);
             // @ts-ignore
            await window.aistudio.drive.save(driveFile, content);
            setSaveStatus('saved');
            setToast({ message: 'Berhasil disimpan ke Drive!', type: 'success' });
        } catch (error) {
            setSaveStatus('error');
            setToast({ message: `Gagal menyimpan ke Drive: ${error instanceof Error ? error.message : 'Unknown error'}`, type: 'error' });
        }
    };

    const handleDriveSaveAs = async () => {
        setSaveStatus('saving');
        try {
            const sessionState = getFullSessionState();
            const content = JSON.stringify(sessionState);
             // @ts-ignore
            const newFile = await window.aistudio.drive.saveAs(content, { suggestedName: 'MUCI Studio.json' });
            if (newFile) {
                setDriveFile(newFile.file);
                setDriveFileName(newFile.file.name);
                setSaveStatus('saved');
                setToast({ message: `Berhasil disimpan sebagai "${newFile.file.name}"!`, type: 'success' });
            } else {
                // User might have cancelled the save dialog
                setSaveStatus(driveFile ? 'saved' : 'idle');
            }
        } catch (error) {
            setSaveStatus('error');
            setToast({ message: `Gagal menyimpan ke Drive: ${error instanceof Error ? error.message : 'Unknown error'}`, type: 'error' });
        }
    };

    const filteredImages = useMemo(() => {
        return favoritesOnly ? generatedImages.filter(img => img.isFavorite) : generatedImages;
    }, [generatedImages, favoritesOnly]);

    const aspectRatioClasses: Record<AspectRatio, string> = {
        '4:5': 'aspect-[4/5]', '1:1': 'aspect-square', '16:9': 'aspect-[16/9]',
    };
    const sessionProgress = sessionTargetCount > 0 ? (generatedImages.length / sessionTargetCount) * 100 : 0;
    
    const CreationPanelContent = () => (
        <>
            <div className="space-y-6">
                <div className="space-y-4 animate-fade-in-up">
                    <h3 className="text-lg font-bold text-[#0D1B2A]">1. Unggah Referensi Wajah</h3>
                    <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-lg">
                        <button onClick={() => setReferenceMode('separate')} className={`text-xs py-2 rounded-md font-semibold ${referenceMode === 'separate' ? 'bg-white shadow' : 'text-gray-600'}`}>Foto Terpisah</button>
                        <button onClick={() => setReferenceMode('couple')} className={`text-xs py-2 rounded-md font-semibold ${referenceMode === 'couple' ? 'bg-white shadow' : 'text-gray-600'}`}>1 Foto Pasangan</button>
                    </div>
                    {referenceMode === 'separate' ? (
                        <>
                            <div className="grid grid-cols-2 gap-2">
                                <IdentityAnchorUploader label="Pria (Depan)" subject="pria" angle="depan" anchor={identityAnchors.find(a => a.subject === 'pria' && a.angle === 'depan')} onFileChange={handleAnchorFileChange} onRemove={handleRemoveAnchorFile} />
                                <IdentityAnchorUploader label="Pria (Samping)" subject="pria" angle="samping" anchor={identityAnchors.find(a => a.subject === 'pria' && a.angle === 'samping')} onFileChange={handleAnchorFileChange} onRemove={handleRemoveAnchorFile} />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <IdentityAnchorUploader label="Wanita (Depan)" subject="wanita" angle="depan" anchor={identityAnchors.find(a => a.subject === 'wanita' && a.angle === 'depan')} onFileChange={handleAnchorFileChange} onRemove={handleRemoveAnchorFile} />
                                <IdentityAnchorUploader label="Wanita (Samping)" subject="wanita" angle="samping" anchor={identityAnchors.find(a => a.subject === 'wanita' && a.angle === 'samping')} onFileChange={handleAnchorFileChange} onRemove={handleRemoveAnchorFile} />
                            </div>
                        </>
                    ) : (
                        <IdentityAnchorUploader label="Foto Pasangan" subject="pasangan" angle="depan" anchor={identityAnchors.find(a => a.subject === 'pasangan')} onFileChange={handleAnchorFileChange} onRemove={handleRemoveAnchorFile} className="h-48" />
                    )}
                    <button onClick={handleOpenOutfitChanger} disabled={referenceMode === 'couple' || identityAnchors.filter(a => a.subject !== 'pasangan').length === 0} title={referenceMode === 'couple' ? "Fitur ini hanya untuk mode Foto Terpisah" : ""} className="w-full text-sm bg-slate-200 text-slate-800 font-semibold py-2 px-3 rounded-lg hover:bg-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        🪄 Ganti Pakaian Referensi
                    </button>
                </div>

                <div className="space-y-4 pt-4 border-t border-slate-200">
                    <h3 className="text-lg font-bold text-[#0D1B2A]">2. Gaya & Suasana</h3>
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label htmlFor="location-theme" className="block text-sm font-medium text-gray-700">Tema Lokasi</label>
                            <div className="flex items-center">
                                <label htmlFor="custom-theme-toggle" className="text-xs font-medium text-gray-600 mr-2">Kustom</label>
                                <button
                                    role="switch"
                                    aria-checked={useCustomTheme}
                                    id="custom-theme-toggle"
                                    onClick={() => setUseCustomTheme(!useCustomTheme)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${useCustomTheme ? 'bg-orange-500' : 'bg-gray-300'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${useCustomTheme ? 'translate-x-6' : 'translate-x-1'}`}/>
                                </button>
                            </div>
                        </div>

                        <select id="location-theme" value={locationTheme} onChange={e => {
                            setLocationTheme(e.target.value);
                            setUseCustomTheme(false);
                        }} disabled={useCustomTheme} className="w-full bg-slate-100 border-slate-200 rounded-lg p-3 text-sm focus:ring-[#FF7043] focus:border-[#FF7043] disabled:opacity-50 disabled:bg-slate-200">
                            {Object.entries(locationGroups).map(([groupName, locations]) => (
                                <optgroup label={groupName} key={groupName}>
                                    {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                                </optgroup>
                            ))}
                        </select>
                        {useCustomTheme && (
                            <div className="mt-2 space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                                <div className="grid grid-cols-2 gap-2 bg-slate-200 p-1 rounded-lg">
                                    <button onClick={() => setCustomThemeMode('prompt')} className={`text-xs py-2 rounded-md font-semibold ${customThemeMode === 'prompt' ? 'bg-white shadow' : 'text-gray-600'}`}>Teks Prompt</button>
                                    <button onClick={() => setCustomThemeMode('image')} className={`text-xs py-2 rounded-md font-semibold ${customThemeMode === 'image' ? 'bg-white shadow' : 'text-gray-600'}`}>Gambar Referensi</button>
                                </div>
                                {customThemeMode === 'prompt' ? (
                                     <div className="relative">
                                        <textarea value={customLocationTheme} onChange={e => setCustomLocationTheme(e.target.value)} rows={3} placeholder="Contoh: 'pasangan di dalam perpustakaan tua dengan cahaya dari jendela besar'" className="w-full bg-white border-slate-200 rounded-lg p-3 text-sm focus:ring-[#FF7043] focus:border-[#FF7043] pr-24" />
                                        <button onClick={handleEnhanceCustomTheme} disabled={isEnhancingTheme} className="absolute bottom-2 right-2 text-xs bg-slate-200 text-slate-700 font-semibold py-1.5 px-2 rounded-md hover:bg-slate-300 disabled:opacity-50">
                                            {isEnhancingTheme ? 'Meningkatkan...' : '✨ Tingkatkan'}
                                        </button>
                                    </div>
                                ) : (
                                    <IdentityAnchorUploader label="Unggah Gambar Lokasi" subject="pasangan" angle="depan" anchor={locationReferenceImage || undefined} onFileChange={(file) => handleLocationReferenceChange(file)} onRemove={handleRemoveLocationReference} className="h-32" />
                                )}
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Gaya Wanita</label>
                        <div className="grid grid-cols-3 gap-2">
                            {(['Referensi Photo', 'Berhijab', 'Tanpa Hijab'] as WomanStyle[]).map(style => (
                                <button key={style} onClick={() => setWomanStyle(style)} className={`px-2 py-2 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2 ${womanStyle === style ? 'bg-white shadow ring-2 ring-orange-400' : 'bg-slate-100 text-gray-600'}`}>
                                    {style === 'Berhijab' ? <HijabIcon /> : style === 'Tanpa Hijab' ? <HairIcon /> : '🖼️'}
                                    {style}
                                </button>
                            ))}
                        </div>
                    </div>
                     <div>
                        <label htmlFor="color-tone" className="block text-sm font-medium text-gray-700 mb-1">Nuansa Warna</label>
                        <select id="color-tone" value={colorTone} onChange={e => setColorTone(e.target.value as ColorTone)} className="w-full bg-slate-100 border-slate-200 rounded-lg p-3 text-sm focus:ring-[#FF7043] focus:border-[#FF7043]">
                            {(['Cerah & Alami', 'Hangat & Keemasan', 'Hitam & Putih', 'Soft & Dreamy', 'Moody & Cinematic', 'Vintage & Nostalgic'] as ColorTone[]).map(tone => (
                                <option key={tone} value={tone}>{tone}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-slate-200">
                    <h3 className="text-lg font-bold text-[#0D1B2A]">3. Pengaturan Teknis</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Rasio Aspek</label>
                            <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-lg">
                                {(['4:5', '1:1', '16:9'] as AspectRatio[]).map(ratio => (
                                    <button key={ratio} onClick={() => setAspectRatio(ratio)} className={`py-2 text-xs font-bold rounded-md transition-colors ${aspectRatio === ratio ? 'bg-white shadow' : 'text-gray-600'}`}>{ratio}</button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Bidikan Kamera</label>
                            <select value={cameraShot} onChange={e => setCameraShot(e.target.value as CameraShot)} className="w-full bg-slate-100 border-slate-200 rounded-lg p-2.5 text-sm focus:ring-[#FF7043] focus:border-[#FF7043]">
                                <option value="Random">Acak (Full/Medium)</option>
                                <option value="Full Body Shot">Full Body</option>
                                <option value="Medium Shot">Medium (Pinggang ke Atas)</option>
                                <option value="Close-up">Close-up (Bahu ke Atas)</option>
                                <option value="Close-up Pria">Close-up Pria</option>
                                <option value="Close-up Wanita">Close-up Wanita</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-medium text-gray-700">Prompt Negatif (Hindari Ini)</label>
                            <div className="flex items-center">
                                <label htmlFor="select-all-negatives-toggle" className="text-xs font-medium text-gray-600 mr-2">
                                    {selectedNegativePrompts.size === D.negativePromptOptions.length ? 'Hapus Semua' : 'Pilih Semua'}
                                </label>
                                <button
                                    role="switch"
                                    aria-checked={selectedNegativePrompts.size === D.negativePromptOptions.length}
                                    id="select-all-negatives-toggle"
                                    onClick={handleToggleAllNegativePrompts}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${selectedNegativePrompts.size === D.negativePromptOptions.length ? 'bg-orange-500' : 'bg-gray-300'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${selectedNegativePrompts.size === D.negativePromptOptions.length ? 'translate-x-6' : 'translate-x-1'}`}/>
                                </button>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {D.negativePromptOptions.map(tag => (
                                <button key={tag} onClick={() => toggleNegativePrompt(tag)} className={`px-3 py-1 text-xs font-semibold rounded-full border-2 ${selectedNegativePrompts.has(tag) ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-700 border-gray-300'}`}>{tag}</button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="flex-shrink-0 p-4 border-t border-gray-200 mt-auto bg-white/80 backdrop-blur-sm space-y-4">
                <div className="grid grid-cols-2 gap-4 items-center">
                    <div>
                        <label className="block text-center text-xs font-medium text-gray-500">Jumlah Foto</label>
                        <div className="flex items-center gap-2 mt-1">
                            <input type="range" min="1" max="10" value={imageCount} onChange={e => setImageCount(parseInt(e.target.value))} className="w-full" />
                            <span className="font-bold text-sm text-gray-700 w-6 text-center">{imageCount}</span>
                        </div>
                    </div>
                     <div>
                        <label className="block text-center text-xs font-medium text-gray-500">Jeda Antar Foto</label>
                        <div className="flex items-center gap-2 mt-1">
                            <input type="range" min="0" max="15" value={delay} onChange={e => setDelay(parseInt(e.target.value))} className="w-full" />
                            <span className="font-bold text-sm text-gray-700 w-6 text-center">{delay}s</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {isLoading ? (
                        <button onClick={handleStop} className="flex-shrink-0 bg-red-100 text-red-700 font-bold py-3 px-4 rounded-xl transition-colors hover:bg-red-200">
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M9 10h6v4H9z" /></svg>
                        </button>
                    ) : sessionFinished ? (
                        <button onClick={handleClearAll} className="flex-shrink-0 bg-slate-200 text-slate-800 font-bold py-3 px-4 rounded-xl transition-colors hover:bg-slate-300">
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h5M20 20v-5h-5" /><path d="M4 9a9 9 0 0114.23-5.76L20 4" /><path d="M20 15a9 9 0 01-14.23 5.76L4 20" /></svg>
                        </button>
                    ) : null}
                    <button 
                        onClick={() => runGeneration(sessionFinished)} 
                        className="w-full bg-[#FF7043] text-white font-bold py-4 px-4 rounded-xl shadow-lg shadow-orange-500/20 hover:bg-opacity-90 transition-all duration-300 transform active:scale-95 focus:outline-none focus:ring-4 focus:ring-orange-500/50 disabled:bg-gray-400 disabled:shadow-none disabled:cursor-not-allowed flex items-center justify-center gap-2" 
                        disabled={isLoading || hasApiKeyIssue}
                    >
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd" /></svg>
                        {isLoading ? statusText.split('|')[0] : (sessionFinished ? `Buat ${imageCount} Lagi` : `Buat Foto`)}
                    </button>
                </div>
                {hasApiKeyIssue && !isLoading && (
                    <p className="text-xs text-red-600 text-center mt-2">
                        Periksa Kunci API Anda di Pengaturan untuk memulai.
                    </p>
                )}
            </div>
        </>
    );

    const mobileButtonText = generatedImages.length > 0 ? 'Sesi Foto' : 'Mulai Berfoto';
    
    const SaveStatusIndicator = () => {
        let text = '';
        let color = 'text-gray-500';
        switch(saveStatus) {
            case 'saving': text = 'Menyimpan...'; color = 'text-blue-500 animate-pulse'; break;
            case 'saved': text = 'Tersimpan'; color = 'text-green-600'; break;
            case 'unsaved': text = '* Perubahan belum disimpan'; color = 'text-yellow-600'; break;
            case 'error': text = 'Gagal menyimpan'; color = 'text-red-500'; break;
            default: return null;
        }
        return <span className={`text-xs ${color}`}>{text}</span>
    }

    return (
        <div className="h-screen w-full bg-white font-['Inter'] flex flex-col">
            <header className="bg-[#0D1B2A] text-white flex-shrink-0 z-20">
                <div className="mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-4">
                            <button onClick={() => setIsCreationPanelOpen(true)} className="p-2 rounded-full hover:bg-white/10 transition-colors lg:hidden" title="Buka Menu">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            </button>
                             <div className="flex items-center gap-3">
                                <h1 className="text-2xl font-extrabold tracking-tight">MUCI</h1>
                                <span className="bg-gradient-to-r from-orange-400 to-yellow-500 text-white text-xs font-bold px-2.5 py-1 rounded-md tracking-wider shadow-sm">STUDIO</span>
                            </div>
                        </div>
                        <div className="flex-grow flex items-center justify-center gap-2">
                             {driveFile && (
                                <div className="hidden sm:flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-lg">
                                    <span className="text-sm font-semibold truncate max-w-xs">{driveFileName}</span>
                                    <SaveStatusIndicator />
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                             <div className="hidden sm:flex items-center gap-1">
                                <button onClick={handleDriveOpen} className="px-3 py-1.5 text-sm font-semibold rounded-md hover:bg-white/10 transition-colors">Buka</button>
                                <button onClick={handleDriveSave} disabled={!driveFile || saveStatus === 'saved'} className="px-3 py-1.5 text-sm font-semibold rounded-md hover:bg-white/10 transition-colors disabled:opacity-50">Simpan</button>
                                <button onClick={handleDriveSaveAs} className="px-3 py-1.5 text-sm font-semibold rounded-md hover:bg-white/10 transition-colors">Simpan Sebagai</button>
                            </div>
                           
                            <input type="file" ref={apiKeyImportInputRef} onChange={handleApiKeyFileSelect} accept=".json" style={{ display: 'none' }} />
                            
                            <div className="relative">
                                <button onClick={() => setIsApiModalOpen(true)} className="p-2 rounded-full hover:bg-white/10 transition-colors" title="Pengaturan">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066 2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                </button>
                                {hasApiKeyIssue && <span className="absolute top-1 right-1 block h-3 w-3 rounded-full bg-red-500 ring-2 ring-[#0D1B2A]"></span>}
                            </div>
                        </div>
                    </div>
                </div>
            </header>
            
            <div className="flex-grow flex overflow-hidden">
                {/* Left Column - Desktop */}
                <aside className="hidden lg:flex lg:flex-col lg:w-[420px] xl:w-[450px] flex-shrink-0 bg-white border-r border-gray-200">
                    <div className="flex-grow overflow-y-auto custom-scrollbar p-4 flex flex-col">
                        <CreationPanelContent />
                    </div>
                </aside>

                {/* Right Column / Main Content Area */}
                <main className="flex-grow overflow-y-auto custom-scrollbar relative">
                    {isLoading && generatedImages.length === 0 && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                            <div className="loader"></div>
                            <p className="text-lg font-semibold mt-6 text-gray-900">{statusText}</p>
                            <div className="text-sm text-gray-500 mt-2 max-w-sm">
                                <p className="transition-opacity duration-500">{loadingTip}</p>
                                {activeApiKeyMasked && <p className="mt-4 text-xs">{activeApiKeyMasked}</p>}
                            </div>
                        </div>
                    )}

                    {!isLoading && generatedImages.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center text-center p-4">
                            <div className="w-full max-w-md">
                                <div className="w-full max-w-xs mx-auto p-2 bg-white rounded-2xl shadow-xl">
                                    <div className="grid grid-cols-3 gap-2">
                                        <img src="https://images.pexels.com/photos/16987120/pexels-photo-16987120.jpeg?q=80&w=400&auto=format&fit=crop" alt="Pasangan pengantin tertawa" className="aspect-[4/5] w-full h-full object-cover rounded-lg" />
                                        <img src="https://images.pexels.com/photos/9728390/pexels-photo-9728390.jpeg?q=80&w=400&auto=format&fit=crop" alt="Foto close-up pengantin wanita" className="aspect-[4/5] w-full h-full object-cover rounded-lg" />
                                        <img src="https://images.pexels.com/photos/17292689/pexels-photo-17292689.jpeg?q=80&w=400&auto=format&fit=crop" alt="Pasangan di depan pemandangan indah" className="aspect-[4/5] w-full h-full object-cover rounded-lg" />
                                        <img src="https://images.pexels.com/photos/6834045/pexels-photo-6834045.jpeg?q=80&w=400&auto=format&fit=crop" alt="Pasangan pengantin berjalan di pantai" className="aspect-[4/5] w-full h-full object-cover rounded-lg" />
                                        <img src="https://images.pexels.com/photos/31750449/pexels-photo-31750449.jpeg?q=80&w=400&auto=format&fit=crop" alt="Detail tangan pasangan dengan cincin" className="aspect-[4/5] w-full h-full object-cover rounded-lg" />
                                        <img src="https://images.pexels.com/photos/5588218/pexels-photo-5588218.jpeg?q=80&w=400&auto=format&fit=crop" alt="Pasangan berpelukan dengan mesra" className="aspect-[4/5] w-full h-full object-cover rounded-lg" />
                                    </div>
                                </div>
                                <div className="mt-8 mb-2 flex items-center justify-center gap-3">
                                    <h1 className="text-4xl font-extrabold tracking-tight text-[#0D1B2A]">MUCI</h1>
                                    <span className="bg-gradient-to-r from-orange-400 to-yellow-500 text-white text-sm font-bold px-3 py-1.5 rounded-lg tracking-wider shadow-md">STUDIO</span>
                                </div>
                                <p className="text-gray-600 mt-2 max-w-lg mx-auto">MUCI siap membantu Anda mewujudkan sesi foto idaman Anda.</p>
                            </div>
                        </div>
                    )}
                    
                    <div className={`flex-grow flex-col min-h-0 ${generatedImages.length > 0 ? 'flex' : 'hidden'}`}>
                        <div className="flex-shrink-0 p-4 sm:p-6 lg:p-8 pb-4">
                             {(isLoading || (sessionFinished && generatedImages.length > 0)) && (
                                <div className="mb-4">
                                    <div className="w-full bg-slate-200 rounded-full h-2">
                                        <div className="bg-[#FF7043] h-2 rounded-full transition-all duration-500" style={{ width: `${sessionProgress}%` }}></div>
                                    </div>
                                    <p className="text-xs text-center text-gray-500 mt-2">
                                        {isLoading ? `Memproses... ` : `Selesai. `} {generatedImages.length} dari {sessionTargetCount} foto.
                                    </p>
                                </div>
                            )}
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-bold text-[#0D1B2A]">Hasil Sesi Foto</h2>
                                    <p className="text-sm text-gray-500">{filteredImages.length} foto ditampilkan.</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setFavoritesOnly(!favoritesOnly)}
                                        className={`text-sm font-semibold p-2.5 rounded-full transition-all duration-200 transform active:scale-95 flex items-center ${favoritesOnly ? 'bg-yellow-400 text-gray-900 shadow-lg shadow-yellow-500/20' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'}`}
                                        title="Tampilkan Favorit"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" /></svg>
                                    </button>
                                    {sessionFinished && !isLoading && (
                                        <>
                                            <button onClick={handleExtractPrompts} className="text-sm bg-slate-100 text-slate-800 font-semibold p-2.5 rounded-full hover:bg-slate-200 transition-colors transform active:scale-95" title="Ekstrak Prompts (JSON)">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                </svg>
                                            </button>
                                            <button onClick={handleClearAll} className="text-sm bg-slate-100 text-slate-800 font-semibold p-2.5 rounded-full hover:bg-slate-200 transition-colors transform active:scale-95" title="Hapus Semua">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                            <button onClick={() => setModals(prev => ({ ...prev, download: true }))} className="text-sm bg-[#0D1B2A] text-white font-bold p-2.5 rounded-full shadow-md hover:bg-opacity-90 transition-all duration-200 transform active:scale-95" title="Unduh">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex-grow p-4 sm:p-6 lg:p-8 pt-0 pb-32">
                            {filteredImages.length === 0 && favoritesOnly ? (
                                <div className="col-span-full flex flex-col items-center justify-center text-center p-8 bg-slate-50 rounded-xl h-full">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.539 1.118l-3.975-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.539-1.118l1.518-4.674a1 1 0 00-.363-1.118L2.05 10.1c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                                    <h3 className="text-xl font-bold text-gray-800">Belum Ada Favorit</h3>
                                    <p className="text-gray-500 mt-2">Ketuk ikon bintang pada foto untuk menambahkannya ke sini.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 gallery-grid">
                                {filteredImages.map((image, index) => (
                                    <div key={image.id} className={`relative group ${aspectRatioClasses[aspectRatio]} rounded-xl overflow-hidden bg-gray-200 animate-fade-in-scale-up gallery-item`} style={{ animationDelay: `${index * 50}ms` }} onClick={() => setModals(prev => ({...prev, lightbox: image.url}))}>
                                        <img src={image.url} alt="Generated prewedding" className="w-full h-full object-cover" />
                                        {processingImages.has(image.id) && (
                                            <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center rounded-xl z-30">
                                                <div className="loader"></div>
                                                <p className="text-sm mt-3 text-gray-300 font-semibold">Memproses...</p>
                                            </div>
                                        )}
                                        <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20" onClick={e => e.stopPropagation()}>
                                            <button onClick={() => handleToggleFavorite(image.id)} title="Favorit" className="p-2 rounded-full text-white bg-black/40 backdrop-blur-sm hover:bg-white/20 transition-colors transform active:scale-90">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill={image.isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-5 w-5 ${image.isFavorite ? 'text-yellow-400' : 'text-white'}`}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                                            </button>
                                            <button onClick={() => handleDeleteImage(image.id)} title="Hapus Gambar" className="p-2 rounded-full text-white bg-black/40 backdrop-blur-sm hover:bg-red-500/80 transition-colors transform active:scale-90">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                            </button>
                                        </div>
                                        <div className="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20" onClick={e => e.stopPropagation()}>
                                            <div className="grid grid-cols-4 gap-1 items-center bg-black/40 backdrop-blur-sm rounded-full p-1">
                                                <button onClick={() => setModals(prev => ({...prev, lightbox: image.url}))} title="Perbesar" className="p-2 rounded-full text-white hover:bg-white/20 transition-colors transform active:scale-90 flex justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg></button>
                                                <button onClick={() => handleVariations(image)} title="Variasi" className="p-2 rounded-full text-white hover:bg-white/20 transition-colors transform active:scale-90 flex justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M12 3c7.2 0 9 1.8 9 9s-1.8 9-9 9-9-1.8-9-9 1.8-9 9-9zM8 12h8M12 8v8"/></svg></button>
                                                <button onClick={() => setModals(prev => ({...prev, editor: image}))} title="Edit" className="p-2 rounded-full text-white hover:bg-white/20 transition-colors transform active:scale-90 flex justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>
                                                <button disabled title="Generate Ulang (TBA)" className="p-2 rounded-full text-white hover:bg-white/20 transition-colors transform active:scale-90 flex justify-center disabled:opacity-50"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M21 21v-5h-5"/></svg></button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {isLoading && (
                                    <div className={`${aspectRatioClasses[aspectRatio]} bg-slate-100 rounded-xl flex flex-col items-center justify-center text-center p-4`}>
                                        <div className="loader"></div>
                                        <p className="text-sm font-semibold mt-4 text-gray-900">{statusText.split('|')[0]}</p>
                                        <div className="text-xs text-gray-500 mt-1">
                                            <p>{statusText.split('|')[1] || 'AI sedang bekerja...'}</p>
                                            {activeApiKeyMasked && <p>{activeApiKeyMasked}</p>}
                                        </div>
                                    </div>
                                )}
                                </div>
                            )}
                        </div>
                    </div>
                </main>
            </div>

            {/* Mobile: Show Panel Button */}
            {!isCreationPanelOpen && (
                <button
                    onClick={() => setIsCreationPanelOpen(true)}
                    className="lg:hidden fixed bottom-5 left-1/2 -translate-x-1/2 z-30 bg-[#0D1B2A] text-white px-6 py-3 rounded-full shadow-lg hover:bg-opacity-90 transition-all transform active:scale-95 flex items-center justify-center gap-2 animate-slide-in-up"
                    aria-label={mobileButtonText}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                    {mobileButtonText}
                </button>
            )}

            {/* Mobile Creation Panel */}
            {isCreationPanelOpen && (
                <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setIsCreationPanelOpen(false)}></div>
            )}
            
            <div className={`fixed bottom-0 left-0 right-0 z-50 bg-white shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.1)] rounded-t-2xl max-h-[90vh] flex flex-col transition-transform duration-300 ease-in-out lg:hidden ${isCreationPanelOpen ? 'translate-y-0' : 'translate-y-full'}`}>
                 <button
                    className="flex-shrink-0 w-full p-2 border-b border-gray-200 text-center cursor-pointer group"
                    onClick={() => setIsCreationPanelOpen(false)}
                    aria-label="Tutup Pengaturan"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mx-auto text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
                <div className="flex-grow overflow-y-auto custom-scrollbar p-4 flex flex-col">
                    <CreationPanelContent />
                </div>
            </div>

            <CommonModals modals={modals} setModals={setModals} isApiModalOpen={isApiModalOpen} setIsApiModalOpen={setIsApiModalOpen}
                isAllKeysFailedModalOpen={isAllKeysFailedModalOpen} setIsAllKeysFailedModalOpen={setIsAllKeysFailedModalOpen} apiKeys={apiKeys}
                apiKeyInput={apiKeyInput} setApiKeyInput={setApiKeyInput} isKeyValidationLoading={isKeyValidationLoading} handleSaveApiKeys={handleSaveApiKeys}
                handleValidateKeys={handleValidateKeys} handleRemoveApiKey={handleRemoveApiKey} handleClearApiKeys={handleClearApiKeys}
                handleDownloadZip={handleDownloadZip} handleDownloadSingle={handleDownloadSingle} generatedImages={generatedImages} handleApplyEdit={handleApplyEdit}
                womanStyle={womanStyle} 
                performApiCall={performApiCall}
                handleApplyOutfitChange={handleApplyOutfitChange}
                activeApiKeyMasked={activeApiKeyMasked} handleGenerateBurstImage={handleGenerateBurstImage} handleSelectBurstWinner={handleSelectBurstWinner}
                isSystemKeyAvailable={!!process.env.API_KEY} systemKeyOwnerId={process.env.SYSTEM_KEY_OWNER_ID || ''} primaryApiKeyId={primaryApiKeyId}
                setPrimaryApiKeyId={setPrimaryApiKeyId}
                handleExportApiKeys={handleExportApiKeys} handleImportApiKeys={handleImportApiKeys}
            />

            {toast && (
                <div id="toast-notification" className={`fixed top-20 left-1/2 -translate-x-1/2 z-[100] flex items-center w-full max-w-xs p-4 space-x-4 rtl:space-x-reverse rounded-xl shadow-lg bg-white border animate-fade-in-down`} role="alert">
                    <div className={`inline-flex items-center justify-center flex-shrink-0 w-8 h-8 rounded-lg ${toast.type === 'success' ? 'text-green-500 bg-green-100' : toast.type === 'error' ? 'text-red-500 bg-red-100' : 'text-blue-500 bg-blue-100'}`}>
                         {toast.type === 'success' ? <svg className="w-5 h-5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20"><path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5Zm3.707 8.207-4 4a1 1 0 0 1-1.414 0l-2-2a1 1 0 0 1 1.414-1.414L9 10.586l3.293-3.293a1 1 0 0 1 1.414 1.414Z"/></svg> : toast.type === 'error' ? <svg className="w-5 h-5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20"><path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM10 15a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm1-4a1 1 0 0 1-2 0V6a1 1 0 0 1 2 0v5Z"/></svg> : <svg className="w-5 h-5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20"><path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM9.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM12 15H8a1 1 0 0 1 0-2h1v-3H8a1 1 0 0 1 0-2h2a1 1 0 0 1 1 1v4h1a1 1 0 0 1 0 2Z"/></svg>}
                        <span className="sr-only">{toast.type} icon</span>
                    </div>
                    <div className="ms-3 text-sm font-normal text-gray-700">{toast.message}</div>
                    <button type="button" onClick={() => setToast(null)} className="ms-auto -mx-1.5 -my-1.5 bg-white text-gray-400 hover:text-gray-900 rounded-lg p-1.5 hover:bg-gray-100 inline-flex items-center justify-center h-8 w-8" aria-label="Close">
                        <span className="sr-only">Close</span>
                        <svg className="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14"><path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"/></svg>
                    </button>
                </div>
            )}
        </div>
    );
};

export default MainApp;
