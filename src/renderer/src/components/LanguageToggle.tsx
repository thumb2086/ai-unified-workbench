import './LanguageToggle.css'
import { useI18n } from '../hooks/useI18n'

export function LanguageToggle() {
  const { lang, setLang, t } = useI18n()

  return (
    <div className="language-toggle">
      <button
        className="lang-btn"
        onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
        title="Switch Language"
      >
        {lang === 'zh' ? t('lang.en') : t('lang.zh')}
      </button>
    </div>
  )
}
