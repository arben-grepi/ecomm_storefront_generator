'use client';

import { useState, useRef, useEffect } from 'react';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getFirebaseApp } from '@/lib/firebase';

/**
 * BannerImageUpload - Component for uploading banner images to Firebase Storage
 * Prioritizes quality over optimization for hero banners
 */
export default function BannerImageUpload({ 
  value, 
  onChange, 
  storefront,
  maxHeight = 550,
  marginBottom = 40,
  onMaxHeightChange,
  onMarginBottomChange,
  heroMainHeading = '',
  heroDescription = ''
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(value || null);
  const fileInputRef = useRef(null);

  // Update preview when value changes externally (e.g., from form load)
  useEffect(() => {
    if (value) {
      setPreview(value);
    } else if (!uploading) {
      setPreview(null);
    }
  }, [value, uploading]);

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (JPG, PNG, etc.)');
      return;
    }

    // Validate file size (max 10MB for high quality)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      setError('Image size must be less than 10MB. Please compress the image or use a smaller file.');
      return;
    }

    setError(null);
    setUploading(true);
    setUploadProgress(0);

    // Show preview immediately
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result);
    };
    reader.readAsDataURL(file);

    try {
      const app = getFirebaseApp();
      if (!app) {
        throw new Error('Firebase app not initialized');
      }

      const storage = getStorage(app);
      
      // Create a unique filename: banners/{storefront}/{timestamp}-{filename}
      const timestamp = Date.now();
      const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storagePath = `banners/${storefront || 'default'}/${timestamp}-${sanitizedFilename}`;
      const storageRef = ref(storage, storagePath);

      // Upload file with progress tracking
      const uploadTask = uploadBytesResumable(storageRef, file, {
        contentType: file.type,
        // Don't compress - maintain original quality
        cacheControl: 'public, max-age=31536000', // Cache for 1 year
      });

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          // Track upload progress
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(Math.round(progress));
        },
        (error) => {
          console.error('Upload error:', error);
          setError(`Upload failed: ${error.message}`);
          setUploading(false);
          setPreview(null);
        },
        async () => {
          // Upload completed successfully
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            setPreview(downloadURL);
            onChange(downloadURL);
            setUploading(false);
            setUploadProgress(100);
            setError(null);
          } catch (error) {
            console.error('Failed to get download URL:', error);
            setError(`Failed to get image URL: ${error.message}`);
            setUploading(false);
            setPreview(null);
          }
        }
      );
    } catch (error) {
      console.error('Upload error:', error);
      setError(`Upload failed: ${error.message}`);
      setUploading(false);
      setPreview(null);
    }
  };

  const handleRemove = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setPreview(null);
    onChange('');
    setError(null);
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Hero Banner Image
      </label>
      
      {/* Preview */}
      {preview && (
        <div className="relative rounded-lg border border-zinc-200 overflow-hidden bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
          <div className="w-full overflow-hidden">
            <img
              src={preview}
              alt="Banner preview"
              className="w-full h-auto object-contain"
            />
          </div>
          {!uploading && (
            <button
              type="button"
              onClick={handleRemove}
              className="absolute top-2 right-2 rounded-full bg-red-500/80 p-1.5 text-white shadow-sm transition hover:bg-red-600 hover:shadow-md"
              title="Remove image"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Upload Progress */}
      {uploading && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Uploading...</span>
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{uploadProgress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* File Input */}
      <div className="flex items-center gap-3">
        <label className="flex cursor-pointer items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">
          {uploading ? 'Uploading...' : preview ? 'Replace Image' : 'Upload Image'}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            disabled={uploading}
            className="hidden"
          />
        </label>
        {preview && !uploading && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Image uploaded to Firebase Storage
          </span>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Help Text */}
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Upload a high-quality banner image (JPG, PNG). Maximum file size: 10MB. 
        The image will be stored in Firebase Storage and displayed in full quality.
      </p>

      {/* Banner controls - no separate preview modal needed, preview is shown in main editor */}
    </div>
  );
}

