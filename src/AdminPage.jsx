import "./AdminPage.css";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: "⌂", active: true },
  { id: "upload", label: "Upload Foto", icon: "⬒" },
  { id: "gallery", label: "Galeri Foto", icon: "▦" },
  { id: "setting", label: "Pengaturan", icon: "⚙" },
];

const recentUploads = [
  { id: 1, name: "Bryan Jon", email: "bryan@kontakku.com", date: "24 Apr 2024" },
  { id: 2, name: "Dita Pramesti", email: "dita@kontakku.com", date: "23 Apr 2024" },
  { id: 3, name: "Reza Ibrahim", email: "reza@kontakku.com", date: "21 Apr 2024" },
];

export default function AdminPage() {
  return (
    <div className="adminRoot">
      <div className="adminBackdrop adminBackdropA" />
      <div className="adminBackdrop adminBackdropB" />

      <aside className="adminSidebar">
        <div className="adminBrand">
          <div className="adminBrandBadge">BJ</div>
          <div>
            <div className="adminBrandTitle">BryanJ</div>
            <div className="adminBrandSub">Project Admin</div>
          </div>
        </div>

        <div className="adminProfile">
          <div className="adminAvatar">B</div>
          <div>
            <div className="adminProfileName">Bryan Jon</div>
            <div className="adminProfileRole">Administrator</div>
          </div>
        </div>

        <nav className="adminNav">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`adminNavItem ${item.active ? "isActive" : ""}`}
            >
              <span className="adminNavIcon" aria-hidden="true">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <button type="button" className="adminLogout">
          Keluar
        </button>
      </aside>

      <main className="adminMain">
        <header className="adminHeader">
          <div>
            <h1 className="adminTitle">Upload Foto Pengguna</h1>
            <p className="adminBreadcrumb">Dashboard / Upload Foto</p>
          </div>
          <button type="button" className="adminBackBtn">
            Kembali
          </button>
        </header>

        <section className="adminCard adminCardEnter">
          <div className="adminSectionHead">
            <h2>Upload Foto Bryan Jon</h2>
          </div>

          <label className="adminLabel" htmlFor="admin-user-name">
            Nama
          </label>
          <input
            id="admin-user-name"
            className="adminInput"
            type="text"
            defaultValue="Bryan Jon"
          />

          <div className="adminUploadGrid">
            <div className="adminPreviewPane">
              <div className="adminPhotoMock" />
            </div>

            <div className="adminDropZone">
              <div className="adminDropIcon">⇪</div>
              <p>Drag and drop gambar di sini</p>
              <button type="button" className="adminPickBtn">
                Pilih File
              </button>
              <small>Ukuran maksimal: 5MB</small>
            </div>
          </div>

          <div className="adminCardActions">
            <button type="button" className="adminBtnGhost">
              Batalkan
            </button>
            <button type="button" className="adminBtnPrimary">
              Upload Foto
            </button>
          </div>
        </section>

        <section className="adminCard adminCardEnter adminDelay">
          <div className="adminSectionHead">
            <h2>Foto Pengguna Terakhir</h2>
            <button type="button" className="adminSeeAll">
              Lihat Semua
            </button>
          </div>

          <div className="adminTableWrap">
            <table className="adminTable">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Nama</th>
                  <th>Email</th>
                  <th>Terunggah Pada</th>
                </tr>
              </thead>
              <tbody>
                {recentUploads.map((item) => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>{item.name}</td>
                    <td>{item.email}</td>
                    <td>{item.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
