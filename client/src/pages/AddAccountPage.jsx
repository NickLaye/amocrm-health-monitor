import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import api from '../services/api';
import { handleApiError } from '../utils/api-helpers';

const INITIAL_STATE = {
  clientId: '',
  label: '',
  environment: 'production',
  amoDomain: '',
  amoClientId: '',
  amoClientSecret: '',
  amoRedirectUri: '',
  amoAccessToken: '',
  amoRefreshToken: '',
  responsibleEmail: '',
  emailRecipients: '',
  mattermostWebhookUrl: '',
  mattermostChannel: '',
  notes: ''
};

const CLIENT_ID_REGEX = /^[A-Za-z0-9#._-]{1,64}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(values) {
  const errors = {};

  const requiredFields = [
    'clientId',
    'label',
    'amoDomain',
    'amoClientId',
    'amoClientSecret',
    'amoRedirectUri',
    'amoAccessToken',
    'amoRefreshToken',
    'mattermostWebhookUrl',
    'mattermostChannel'
  ];

  requiredFields.forEach((field) => {
    if (!values[field]?.trim()) {
      errors[field] = 'Обязательное поле';
    }
  });

  if (values.clientId && !CLIENT_ID_REGEX.test(values.clientId)) {
    errors.clientId = 'Допустимы буквы, цифры, # . _ - (до 64 символов)';
  }

  if (values.amoRedirectUri) {
    try {
      // eslint-disable-next-line no-new
      new URL(values.amoRedirectUri);
    } catch {
      errors.amoRedirectUri = 'Невалидный URL';
    }
  }

  if (values.mattermostWebhookUrl) {
    try {
      // eslint-disable-next-line no-new
      new URL(values.mattermostWebhookUrl);
    } catch {
      errors.mattermostWebhookUrl = 'Невалидный URL';
    }
  }

  if (values.responsibleEmail && !EMAIL_REGEX.test(values.responsibleEmail)) {
    errors.responsibleEmail = 'Некорректный email';
  }

  if (values.emailRecipients) {
    const recipients = values.emailRecipients
      .split(',')
      .map((recipient) => recipient.trim())
      .filter(Boolean);
    const invalid = recipients.find((recipient) => !EMAIL_REGEX.test(recipient));
    if (invalid) {
      errors.emailRecipients = `Некорректный email: ${invalid}`;
    }
  }

  return errors;
}

function mapPayload(values) {
  return {
    clientId: values.clientId.trim(),
    label: values.label.trim(),
    environment: values.environment,
    amoDomain: values.amoDomain.trim(),
    amoClientId: values.amoClientId.trim(),
    amoClientSecret: values.amoClientSecret.trim(),
    amoRedirectUri: values.amoRedirectUri.trim(),
    amoAccessToken: values.amoAccessToken.trim(),
    amoRefreshToken: values.amoRefreshToken.trim(),
    responsibleEmail: values.responsibleEmail.trim(),
    emailRecipients: values.emailRecipients
      ? values.emailRecipients
          .split(',')
          .map((recipient) => recipient.trim())
          .filter(Boolean)
      : [],
    mattermostWebhookUrl: values.mattermostWebhookUrl.trim(),
    mattermostChannel: values.mattermostChannel.trim(),
    notes: values.notes.trim()
  };
}

export default function AddAccountPage() {
  const navigate = useNavigate();
  const [formValues, setFormValues] = useState(INITIAL_STATE);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({
      ...prev,
      [name]: value
    }));
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationErrors = validate(formValues);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      setIsSubmitting(true);
      setServerError(null);
      await api.createAccount(mapPayload(formValues));
      setIsSuccess(true);
      setTimeout(() => {
        navigate('/');
      }, 1200);
    } catch (error) {
      setServerError(handleApiError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950/95 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">amoCRM Health Monitor</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Добавление аккаунта</h1>
            <p className="text-sm text-slate-400">Все поля интеграции с amoCRM и Mattermost обязательны</p>
          </div>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl border border-slate-700 px-5 py-2 text-sm font-semibold text-slate-100 transition hover:border-emerald-400/80 hover:text-emerald-200"
          >
            ← Вернуться к дашборду
          </Link>
        </header>

        <form onSubmit={handleSubmit} className="space-y-8">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg shadow-black/30">
            <h2 className="text-xl font-semibold text-white">Основные данные</h2>
            <p className="text-sm text-slate-400">Client ID нужен для переменных окружения и выбора в селекторе.</p>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <div>
                <label htmlFor="clientId" className="text-sm font-medium text-slate-300">
                  Client ID *
                </label>
                <input
                  id="clientId"
                  name="clientId"
                  type="text"
                  value={formValues.clientId}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/50 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                />
                {errors.clientId && <p className="mt-2 text-xs text-red-400">{errors.clientId}</p>}
              </div>
              <div>
                <label htmlFor="label" className="text-sm font-medium text-slate-300">
                  Отображаемое имя *
                </label>
                <input
                  id="label"
                  name="label"
                  type="text"
                  value={formValues.label}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/50 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                />
                {errors.label && <p className="mt-2 text-xs text-red-400">{errors.label}</p>}
              </div>
              <div>
                <label htmlFor="environment" className="text-sm font-medium text-slate-300">
                  Среда
                </label>
                <select
                  id="environment"
                  name="environment"
                  value={formValues.environment}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/50 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                >
                  <option value="production">Production</option>
                  <option value="staging">Staging</option>
                  <option value="test">Test</option>
                </select>
              </div>
              <div>
                <label htmlFor="responsibleEmail" className="text-sm font-medium text-slate-300">
                  Ответственный email
                </label>
                <input
                  id="responsibleEmail"
                  name="responsibleEmail"
                  type="email"
                  value={formValues.responsibleEmail}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/50 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                />
                {errors.responsibleEmail && <p className="mt-2 text-xs text-red-400">{errors.responsibleEmail}</p>}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg shadow-black/30">
            <h2 className="text-xl font-semibold text-white">Интеграция amoCRM</h2>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              {[
                { id: 'amoDomain', label: 'Поддомен amoCRM *', placeholder: 'example.amocrm.ru' },
                { id: 'amoClientId', label: 'Client ID *' },
                { id: 'amoClientSecret', label: 'Client Secret *' },
                { id: 'amoRedirectUri', label: 'Redirect URI *', placeholder: 'https://...' },
                { id: 'amoAccessToken', label: 'Access Token *' },
                { id: 'amoRefreshToken', label: 'Refresh Token *' }
              ].map((field) => (
                <div key={field.id}>
                  <label htmlFor={field.id} className="text-sm font-medium text-slate-300">
                    {field.label}
                  </label>
                  <input
                    id={field.id}
                    name={field.id}
                    type="text"
                    placeholder={field.placeholder}
                    value={formValues[field.id]}
                    onChange={handleChange}
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/50 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  />
                  {errors[field.id] && <p className="mt-2 text-xs text-red-400">{errors[field.id]}</p>}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg shadow-black/30">
            <h2 className="text-xl font-semibold text-white">Оповещения</h2>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <div>
                <label htmlFor="mattermostWebhookUrl" className="text-sm font-medium text-slate-300">
                  Mattermost Webhook URL *
                </label>
                <input
                  id="mattermostWebhookUrl"
                  name="mattermostWebhookUrl"
                  type="url"
                  value={formValues.mattermostWebhookUrl}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/50 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                />
                {errors.mattermostWebhookUrl && <p className="mt-2 text-xs text-red-400">{errors.mattermostWebhookUrl}</p>}
              </div>
              <div>
                <label htmlFor="mattermostChannel" className="text-sm font-medium text-slate-300">
                  Mattermost канал *
                </label>
                <input
                  id="mattermostChannel"
                  name="mattermostChannel"
                  type="text"
                  placeholder="skypro-crm-alerts"
                  value={formValues.mattermostChannel}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/50 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                />
                {errors.mattermostChannel && <p className="mt-2 text-xs text-red-400">{errors.mattermostChannel}</p>}
              </div>
              <div className="md:col-span-2">
                <label htmlFor="emailRecipients" className="text-sm font-medium text-slate-300">
                  Email-адреса (через запятую)
                </label>
                <input
                  id="emailRecipients"
                  name="emailRecipients"
                  type="text"
                  placeholder="alerts@example.com, sre@example.com"
                  value={formValues.emailRecipients}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/50 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                />
                {errors.emailRecipients && <p className="mt-2 text-xs text-red-400">{errors.emailRecipients}</p>}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg shadow-black/30">
            <label htmlFor="notes" className="text-sm font-medium text-slate-300">
              Комментарии
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={4}
              value={formValues.notes}
              onChange={handleChange}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/50 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
            />
          </section>

          {serverError && (
            <div className="rounded-xl border border-red-900/60 bg-red-900/20 px-4 py-3 text-sm text-red-200">
              {serverError}
            </div>
          )}

          {isSuccess && (
            <div className="rounded-xl border border-emerald-900/60 bg-emerald-900/20 px-4 py-3 text-sm text-emerald-200">
              Аккаунт создан. Возвращаемся к дашборду...
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center rounded-2xl bg-emerald-500/90 px-6 py-3 text-base font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <LoadingSpinner size="small" message="" />
                <span className="ml-2">Сохраняем...</span>
              </>
            ) : (
              'Сохранить аккаунт'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
