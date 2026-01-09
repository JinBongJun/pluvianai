'use client';

import { useState, useRef, useEffect } from 'react';
import { Globe } from 'lucide-react';
import { clsx } from 'clsx';

type Language = 'en' | 'ko' | 'zh';

const languages: { code: Language; name: string; nativeName: string }[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
];

interface LanguageSelectorProps {
  variant?: 'header' | 'footer';
}

export default function LanguageSelector({ variant = 'header' }: LanguageSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentLang, setCurrentLang] = useState<Language>('en');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load language from localStorage
    const savedLang = localStorage.getItem('language') as Language;
    if (savedLang && languages.find(l => l.code === savedLang)) {
      setCurrentLang(savedLang);
    }

    // Handle click outside
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLanguageChange = (lang: Language) => {
    setCurrentLang(lang);
    localStorage.setItem('language', lang);
    setIsOpen(false);
    // TODO: Implement actual i18n logic here
    // For now, just store the preference
  };

  const currentLanguage = languages.find(l => l.code === currentLang) || languages[0];

  if (variant === 'footer') {
    return (
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-slate-400" />
        <select
          value={currentLang}
          onChange={(e) => handleLanguageChange(e.target.value as Language)}
          className="bg-transparent border-none text-slate-400 text-sm focus:outline-none focus:ring-0 cursor-pointer"
        >
          {languages.map((lang) => (
            <option key={lang.code} value={lang.code} className="bg-[#0B0C15]">
              {lang.nativeName}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'flex items-center gap-2 px-3 py-2 rounded-md transition-colors',
          'text-slate-400 hover:text-white hover:bg-white/5',
          'focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-[#000314]'
        )}
      >
        <Globe className="h-4 w-4" />
        <span className="text-sm font-medium">{currentLanguage.code.toUpperCase()}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-[#0B0C15] rounded-lg shadow-2xl border border-white/10 z-50 overflow-hidden">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleLanguageChange(lang.code)}
              className={clsx(
                'w-full text-left px-4 py-2 text-sm transition-colors',
                'hover:bg-white/5',
                currentLang === lang.code
                  ? 'bg-purple-500/20 text-white font-medium'
                  : 'text-slate-400 hover:text-white'
              )}
            >
              <div className="flex items-center justify-between">
                <span>{lang.nativeName}</span>
                <span className="text-xs text-slate-500">{lang.name}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
