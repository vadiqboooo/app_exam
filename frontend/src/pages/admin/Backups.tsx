import { CheckCircle2, CloudUpload, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { BackupState, DriveState, FolderState, YandexState } from '../../types';
import { api } from '../../api/client';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ErrorNotice } from '../../components/ErrorNotice';
import { useAction } from '../../hooks/useAction';
import { useLoad } from '../../hooks/useLoad';
import { backupAge, backupTime, fileSize } from '../../lib/backup';

const load = () => api.backups.state();

export function Backups() {
  const { data, error: loadError, loading, refresh } = useLoad(load);
  const { busy, error, run, clearError } = useAction();
  const [created, setCreated] = useState('');
  const [restoring, setRestoring] = useState<string | null>(null);
  const [restored, setRestored] = useState('');
  const [params] = useSearchParams();
  const driveError = params.get('drive_error');

  const create = () => {
    clearError();
    setCreated('');
    void run(async () => {
      const item = await api.backups.create();
      setCreated(item.name);
      await refresh();
    });
  };

  const restore = () => {
    const name = restoring;
    if (!name) return;
    setRestoring(null);
    clearError();
    setRestored('');
    void run(async () => {
      const result = await api.backups.restore(name);
      setRestored(result.safety_copy);
      await refresh();
    });
  };

  return (
    <div className="sc-section bk-page">
      <ErrorNotice message={error || loadError || driveError || undefined} />
      {params.get('drive') === 'ok' && (
        <div className="success-notice" role="status">
          <CheckCircle2 size={20} />
          Google Drive подключён. Теперь можно выгрузить первую копию.
        </div>
      )}
      {restored && (
        <div className="success-notice" role="status">
          <CheckCircle2 size={20} />
          <span>
            База восстановлена из копии. Прежние данные сохранены на сервере: {restored}. Обновите страницу,
            чтобы увидеть восстановленные данные.
          </span>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Обновить страницу
          </Button>
        </div>
      )}
      {created && (
        <div className="success-notice" role="status">
          <CheckCircle2 size={20} />
          Копия сохранена: {created}
        </div>
      )}
      <p className="imp-intro">
        Копия всей базы — ученики, группы, пробники, результаты и файлы вариантов — сохраняется в вашем
        облаке: на Яндекс Диске (или в Google Drive). Перед импортом из CRM система проверяет, когда была
        сделана последняя копия.
      </p>
      {data?.yandex?.connected ? (
        <YandexPanel yandex={data.yandex} onChange={refresh} />
      ) : data?.folder?.connected ? (
        <FolderPanel folder={data.folder} onChange={refresh} />
      ) : data?.drive?.connected ? (
        <DrivePanel drive={data.drive} onChange={refresh} />
      ) : (
        data?.yandex && (
          <>
            <YandexPanel yandex={data.yandex} onChange={refresh} />
            <details className="bk-more">
              <summary>Другие способы: папка облака на компьютере, Google Drive</summary>
              {data.folder && <FolderPanel folder={data.folder} onChange={refresh} />}
              {data.drive && <DrivePanel drive={data.drive} onChange={refresh} />}
            </details>
          </>
        )
      )}
      {data?.configured && (
        <section className="bk-card">
          <div className="bk-status">
            <div>
              <span>Последняя копия</span>
              <strong>{data.latest ? backupTime(data.latest.created) : 'Копий ещё нет'}</strong>
              <small>
                {data.latest ? backupAge(data.latest.created) : `Хранилище: ${data.bucket}`}
                {data.latest && data.stale ? ' · пора обновить' : ''}
              </small>
            </div>
            <Button icon={<CloudUpload size={18} />} disabled={busy} onClick={create}>
              {busy ? 'Загружаем…' : 'Сделать копию'}
            </Button>
          </div>
          {data.backups && data.backups.length > 0 && (
            <div className="bk-list" role="table" aria-label="Копии в облаке">
              {data.backups.map((item) => (
                <div key={item.name} role="row">
                  <span role="cell">
                    <b>{item.name}</b>
                    <small>{backupTime(item.created)}</small>
                  </span>
                  <span role="cell">{fileSize(item.size)}</span>
                  <span role="cell">
                    <Button variant="secondary" disabled={busy} onClick={() => setRestoring(item.name)}>
                      Восстановить
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="bk-note">
            Хранилище: {data.bucket}. Показаны последние 10 копий. Кнопка «Восстановить» заменяет текущую базу
            данными из копии; перед этим на сервере сохраняется страховочная копия.
          </p>
        </section>
      )}
      {loading && !data && <p className="imp-text">Проверяем облако…</p>}
      {restoring && (
        <ConfirmDialog
          title="Восстановить базу из копии?"
          text={`Все текущие данные (ученики, группы, пробники, результаты) будут заменены данными из копии ${restoring}. Перед этим на сервере сохранится страховочная копия текущей базы. Сотрудникам, возможно, придётся войти заново.`}
          confirm="Восстановить"
          danger
          busy={busy}
          onClose={() => setRestoring(null)}
          onConfirm={restore}
        />
      )}
    </div>
  );
}

function FolderPanel({ folder, onChange }: { folder: FolderState; onChange: () => Promise<void> }) {
  const { busy, error, run } = useAction();
  const [path, setPath] = useState('');

  const connect = () =>
    void run(async () => {
      await api.backups.connectFolder(path);
      await onChange();
    });
  const disconnect = () =>
    void run(async () => {
      await api.backups.disconnectFolder();
      await onChange();
    });

  if (folder.connected)
    return (
      <div className="bk-drive is-connected">
        <ErrorNotice message={error} />
        <div>
          <CheckCircle2 size={20} />
          <span>Копии сохраняются в папку {folder.path}</span>
          <Button variant="secondary" disabled={busy} onClick={disconnect}>
            Отключить
          </Button>
        </div>
      </div>
    );
  return (
    <form
      className="bk-drive"
      onSubmit={(event) => {
        event.preventDefault();
        connect();
      }}
    >
      <ErrorNotice message={error} />
      <label htmlFor="folder-path">Папка, которую синхронизирует облако</label>
      <div>
        <input
          id="folder-path"
          value={path}
          placeholder="C:\Users\Вы\Yandex.Disk\Probnik backups"
          onChange={(event) => setPath(event.target.value)}
        />
        <Button type="submit" disabled={busy || !path.trim()}>
          {busy ? 'Проверяем…' : 'Подключить папку'}
        </Button>
      </div>
      <small>
        Установите бесплатное приложение «Яндекс Диск» (или Google Drive для компьютеров, Dropbox), создайте в
        его папке подпапку и вставьте её путь. Приложение кладёт копии в эту папку, а облачный клиент сам
        загружает их в облако. Клиент должен работать на этом компьютере.
      </small>
    </form>
  );
}

function YandexPanel({ yandex, onChange }: { yandex: YandexState; onChange: () => Promise<void> }) {
  const { busy, error, run } = useAction();
  const [typedId, setTypedId] = useState('');
  const clientId = yandex.client_id ?? typedId;
  const [token, setToken] = useState('');

  const connect = () =>
    void run(async () => {
      await api.backups.connectYandex(token);
      setToken('');
      await onChange();
    });
  const disconnect = () =>
    void run(async () => {
      await api.backups.disconnectYandex();
      await onChange();
    });

  if (yandex.connected)
    return (
      <div className="bk-drive is-connected">
        <ErrorNotice message={error} />
        <div>
          <CheckCircle2 size={20} />
          <span>Яндекс Диск подключён · {yandex.where}</span>
          <Button variant="secondary" disabled={busy} onClick={disconnect}>
            Отключить
          </Button>
        </div>
      </div>
    );
  return (
    <form
      className="bk-drive"
      onSubmit={(event) => {
        event.preventDefault();
        connect();
      }}
    >
      <ErrorNotice message={error} />
      {!yandex.client_id && <label htmlFor="ya-client">ID приложения Яндекса</label>}
      <div>
        {!yandex.client_id && (
          <input
            id="ya-client"
            value={typedId}
            placeholder="например 4f2c9d…"
            onChange={(event) => setTypedId(event.target.value)}
          />
        )}
        <Button
          variant="secondary"
          disabled={!clientId.trim()}
          onClick={() =>
            window.open(
              `https://oauth.yandex.ru/authorize?response_type=token&client_id=${encodeURIComponent(clientId.trim())}`,
              '_blank',
              'noopener',
            )
          }
        >
          Открыть вход Яндекса
        </Button>
      </div>
      <label htmlFor="ya-token">Токен</label>
      <input
        id="ya-token"
        type="password"
        value={token}
        autoComplete="off"
        onChange={(event) => setToken(event.target.value)}
      />
      <div>
        <Button type="submit" disabled={busy || !token.trim()}>
          {busy ? 'Проверяем…' : 'Подключить Яндекс Диск'}
        </Button>
      </div>
      <ol className="bk-steps">
        <li>
          На oauth.yandex.ru/client/new создайте приложение: платформа «Веб-сервисы», Callback URL —{' '}
          <code>https://oauth.yandex.ru/verification_code</code>, право «Яндекс.Диск REST API → Доступ к папке
          приложения».
        </li>
        <li>
          Вставьте сюда ID приложения и нажмите «Открыть вход Яндекса», разрешите доступ — Яндекс покажет
          токен.
        </li>
        <li>Вставьте токен и нажмите «Подключить». Копии будут лежать в «Приложения» на вашем диске.</li>
      </ol>
    </form>
  );
}

function DrivePanel({ drive, onChange }: { drive: DriveState; onChange: () => Promise<void> }) {
  const { busy, error, run } = useAction();
  const [link, setLink] = useState('');

  const connect = () =>
    void run(async () => {
      const { url } = await api.backups.connectDrive(link);
      window.location.href = url;
    });
  const disconnect = () =>
    void run(async () => {
      await api.backups.disconnectDrive();
      await onChange();
    });

  if (drive.connected)
    return (
      <div className="bk-drive is-connected">
        <ErrorNotice message={error} />
        <div>
          <CheckCircle2 size={20} />
          <span>Google Drive подключён{drive.folder_name ? ` · папка «${drive.folder_name}»` : ''}</span>
          <Button variant="secondary" disabled={busy} onClick={disconnect}>
            Отключить
          </Button>
        </div>
      </div>
    );
  if (!drive.client_configured)
    return (
      <div className="bk-setup">
        <TriangleAlert size={20} />
        <div>
          <strong>Нужен файл client_secret.json</strong>
          <p>
            В Google Cloud Console создайте OAuth client ID типа «Web application» и добавьте в «Authorized
            redirect URIs» адрес <code>{drive.redirect_uri}</code>. Скачайте JSON, положите его в папку
            приложения под именем <code>client_secret.json</code> и обновите страницу.
          </p>
        </div>
      </div>
    );
  return (
    <form
      className="bk-drive"
      onSubmit={(event) => {
        event.preventDefault();
        connect();
      }}
    >
      <ErrorNotice message={error} />
      <label htmlFor="drive-folder">Ссылка на папку Google Drive</label>
      <div>
        <input
          id="drive-folder"
          value={link}
          placeholder="https://drive.google.com/drive/folders/…"
          onChange={(event) => setLink(event.target.value)}
        />
        <Button type="submit" disabled={busy || !link.trim()}>
          {busy ? 'Открываем Google…' : 'Подключить Google Drive'}
        </Button>
      </div>
      <small>
        В OAuth-клиенте должен быть адрес возврата <code>{drive.redirect_uri}</code>. Вход в Google нужен один
        раз; копии пойдут в эту папку и будут читаться из неё.
      </small>
    </form>
  );
}

/** What an import knows about the last cloud backup: a warning, never a block. */
export function BackupCheck({ state }: { state: BackupState }) {
  const fresh = state.configured && !state.error && !state.stale && state.latest;
  const text = !state.configured
    ? 'Облако для копий не настроено — вернуть данные после импорта будет нечем.'
    : state.error
      ? `Не удалось проверить облако: ${state.error}`
      : !state.latest
        ? 'В облаке нет ни одной копии базы.'
        : `${state.stale ? 'Последняя копия устарела' : 'Последняя копия'}: ${backupTime(state.latest.created)} (${backupAge(state.latest.created)}).`;
  return (
    <div className={`bk-check${fresh ? ' is-fresh' : ''}`} role={fresh ? 'status' : 'alert'}>
      {fresh ? <CheckCircle2 size={20} /> : <TriangleAlert size={20} />}
      <span>
        {text}{' '}
        {!fresh && (
          <>
            Перед применением лучше <Link to="/school/backups">сделать копию</Link>.
          </>
        )}
      </span>
    </div>
  );
}
