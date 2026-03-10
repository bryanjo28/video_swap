import { useCallback, useEffect, useMemo, useState } from "react";
import "./AdminPage.css";
import { FaTrash, FaPen } from "react-icons/fa";
import { CiTextAlignRight } from "react-icons/ci";

const API_BASE_URL = "http://localhost:8000";
const ITEMS_PER_PAGE = 5;

const navItems = [{ id: "dashboard", label: "Dashboard", active: true }];

const safeText = (value) => {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
};

const toSlug = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");


export default function AdminPage() {
  const [costumes, setCostumes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [genderFilter, setGenderFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState("");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");
  const [editForm, setEditForm] = useState({
    id: "",
    name: "",
    gender: "male",
    isActive: true,
    video: null,
    thumbnail: null,
  });
  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    id: null,
    name: "",
  });
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [addForm, setAddForm] = useState({
    name: "",
    gender: "male",
    isActive: true,
    video: null,
    thumbnail: null,
  });

  const loadCostumes = useCallback(async () => {
    try {
      setIsLoading(true);
      setError("");

      const response = await fetch(
        `${API_BASE_URL}/costumes?includeThumbBase64=true`
      );
      const json = await response.json();
      if (!response.ok || json?.ok === false) {
        throw new Error(json?.detail || json?.message || "Failed to load costumes");
      }

      setCostumes(Array.isArray(json?.items) ? json.items : []);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCostumes();
  }, [loadCostumes]);

  // opsional: tutup modal pakai ESC
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        if (!addSubmitting) {
          setIsAddModalOpen(false);
        }
        if (!editSubmitting) {
          setIsEditModalOpen(false);
          setEditError("");
        }
        if (!deleteSubmitting) {
          setDeleteModal({ isOpen: false, id: null, name: "" });
          setDeleteError("");
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [addSubmitting, editSubmitting, deleteSubmitting]);

  const genderOptions = useMemo(() => {
    const unique = new Set(
      costumes
        .map((item) => String(item?.gender || "").trim().toLowerCase())
        .filter(Boolean)
    );
    return ["all", ...Array.from(unique)];
  }, [costumes]);

  const filteredCostumes = useMemo(() => {
    const search = searchQuery.trim().toLowerCase();
    return costumes.filter((item) => {
      const itemGender = String(item?.gender || "").trim().toLowerCase();
      const itemName = String(item?.name || "").toLowerCase();
      const isActive = item?.isActive !== false;
      const passGender = genderFilter === "all" || itemGender === genderFilter;
      const passActive =
        activeFilter === "all" ||
        (activeFilter === "active" && isActive) ||
        (activeFilter === "inactive" && !isActive);
      const passSearch = !search || itemName.includes(search);
      return passGender && passActive && passSearch;
    });
  }, [costumes, genderFilter, activeFilter, searchQuery]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredCostumes.length / ITEMS_PER_PAGE)
  );
  const currentPageSafe = Math.min(currentPage, totalPages);

  const pagedCostumes = useMemo(() => {
    const startIndex = (currentPageSafe - 1) * ITEMS_PER_PAGE;
    return filteredCostumes.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredCostumes, currentPageSafe]);

  useEffect(() => {
    setCurrentPage(1);
  }, [genderFilter, activeFilter, searchQuery]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const resetAddForm = () => {
    setAddForm({
      name: "",
      gender: "male",
      isActive: true,
      video: null,
      thumbnail: null,
    });
    setAddError("");
    setAddSubmitting(false);
  };

  const handleOpenAddModal = () => {
    resetAddForm();
    setIsAddModalOpen(true);
  };

  const handleCloseAddModal = () => {
    if (addSubmitting) return;
    setIsAddModalOpen(false);
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    try {
      setAddError("");

      const trimmedName = addForm.name.trim();
      if (!trimmedName) {
        throw new Error("Name is required.");
      }
      if (!addForm.video) {
        throw new Error("Video file is required.");
      }
      if (!addForm.thumbnail) {
        throw new Error("Thumbnail file is required.");
      }

      setAddSubmitting(true);
      const formData = new FormData();
      formData.append("name", trimmedName);
      formData.append("gender", addForm.gender);
      formData.append("isActive", addForm.isActive ? "true" : "false");
      formData.append("video", addForm.video);
      formData.append("thumbnail", addForm.thumbnail);

      const response = await fetch(`${API_BASE_URL}/costumes`, {
        method: "POST",
        body: formData,
      });
      const json = await response.json();
      if (!response.ok || json?.ok === false) {
        throw new Error(json?.detail || json?.message || "Failed to create costume");
      }

      await loadCostumes();
      setIsAddModalOpen(false);
      resetAddForm();
    } catch (err) {
      setAddError(err?.message || String(err));
    } finally {
      setAddSubmitting(false);
    }
  };

  const slugPreview = toSlug(addForm.name) || "(auto generate)";
  const editSlugPreview = toSlug(editForm.name) || "(auto generate)";

  const handleOpenEditModal = (item) => {
    setEditError("");
    setEditForm({
      id: String(item?.id || ""),
      name: String(item?.name || ""),
      gender: String(item?.gender || "male").toLowerCase() === "female" ? "female" : "male",
      isActive: item?.isActive !== false,
      video: null,
      thumbnail: null,
    });
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    if (editSubmitting) return;
    setIsEditModalOpen(false);
    setEditError("");
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      setEditError("");

      if (!editForm.id) {
        throw new Error("Invalid costume id.");
      }

      const trimmedName = editForm.name.trim();
      if (!trimmedName) {
        throw new Error("Name is required.");
      }

      setEditSubmitting(true);
      const formData = new FormData();
      formData.append("name", trimmedName);
      formData.append("gender", editForm.gender);
      formData.append("isActive", editForm.isActive ? "true" : "false");
      if (editForm.video) {
        formData.append("video", editForm.video);
      }
      if (editForm.thumbnail) {
        formData.append("thumbnail", editForm.thumbnail);
      }

      const response = await fetch(`${API_BASE_URL}/costumes/${editForm.id}`, {
        method: "PUT",
        body: formData,
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.ok === false) {
        throw new Error(json?.detail || json?.message || "Failed to update costume");
      }

      await loadCostumes();
      setIsEditModalOpen(false);
      setEditForm({
        id: "",
        name: "",
        gender: "male",
        isActive: true,
        video: null,
        thumbnail: null,
      });
      setEditError("");
    } catch (err) {
      setEditError(err?.message || String(err));
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleOpenDeleteModal = (item) => {
    setDeleteError("");
    setDeleteModal({
      isOpen: true,
      id: item?.id ?? null,
      name: safeText(item?.name),
    });
  };

  const handleCloseDeleteModal = () => {
    if (deleteSubmitting) return;
    setDeleteModal({ isOpen: false, id: null, name: "" });
    setDeleteError("");
  };

  const handleConfirmDelete = async () => {
    if (!deleteModal.id) {
      setDeleteError("Invalid costume id.");
      return;
    }

    try {
      setDeleteError("");
      setDeleteSubmitting(true);

      const res = await fetch(`${API_BASE_URL}/costumes/${deleteModal.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.detail || data?.message || "Delete failed");
      }

      await loadCostumes();
      setDeleteModal({ isOpen: false, id: null, name: "" });
    } catch (err) {
      setDeleteError(err?.message || String(err));
    } finally {
      setDeleteSubmitting(false);
    }
  };

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
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="adminMain">
        <header className="adminHeader">
          <div>
            <h1 className="adminTitle">Dashboard</h1>
            <p className="adminBreadcrumb">Dashboard</p>
          </div>
        </header>

        <section className="adminCard adminCardEnter">
          <div className="adminSectionHead">
            <h2>Costume Data</h2>
            <button type="button" className="adminSeeAll" onClick={handleOpenAddModal}>
              + Add New
            </button>
          </div>

          <div className="adminTableTools">
            <input
              type="text"
              className="adminSearchInput"
              placeholder="Search name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="adminFilterTools">
            <select
              className="adminGenderSelect"
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value)}
            >
              {genderOptions.map((gender) => (
                <option key={gender} value={gender}>
                  {gender === "all"
                    ? "All Gender"
                    : gender.charAt(0).toUpperCase() + gender.slice(1)}
                </option>
              ))}
            </select>
            <select
              className="adminGenderSelect"
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="adminTableWrap">
            <table className="adminTable">
              <thead>
                <tr>
                  <th>No</th>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Gender</th>
                  <th>Active</th>
                  <th>Foto Kostum</th>
                  <th style={{textAlign:"right"}}>Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7}>Loading costumes...</td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={7}>Failed to load costumes: {error}</td>
                  </tr>
                ) : filteredCostumes.length === 0 ? (
                  <tr>
                    <td colSpan={7}>No data matches current filter/search.</td>
                  </tr>
                ) : (
                  pagedCostumes.map((item, index) => (
                    <tr key={`${safeText(item?.id)}-${index}`}>
                      <td>{(currentPageSafe - 1) * ITEMS_PER_PAGE + index + 1}</td>
                      <td>{safeText(item?.id)}</td>
                      <td>{safeText(item?.name)}</td>
                      <td>{safeText(item?.gender)}</td>
                      <td >
                        <span
                          style={{
                            padding: "4px 6px",
                            borderRadius: "20px",
                            fontSize: "12px",
                            fontWeight: "500",
                            color: "white",
                            backgroundColor: item?.isActive ? "#22c55e" : "#ef4444",
                          }}
                        >
                          {item?.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        {item?.thumbBase64 || item?.thumbPath ? (
                          <img
                            className="adminThumbPreview"
                            src={item.thumbBase64 || item.thumbPath}
                            alt={safeText(item?.name)}
                          />
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "8px", justifyContent: "right" }}>

                          {/* EDIT */}
                          <button
                            style={{
                              backgroundColor: "#facc15",
                              border: "none",
                              padding: "8px",
                              borderRadius: "6px",
                              cursor: "pointer",
                            }}
                            onClick={() => handleOpenEditModal(item)}
                          >
                            <FaPen color="black" />
                          </button>

                          {/* DELETE */}
                          <button
                            style={{
                              backgroundColor: "#ef4444",
                              border: "none",
                              padding: "8px",
                              borderRadius: "6px",
                              cursor: "pointer",
                            }}
                            onClick={() => handleOpenDeleteModal(item)}
                          >
                            <FaTrash color="white" />
                          </button>

                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!isLoading && !error && filteredCostumes.length > 0 ? (
            <div className="adminPagination">
              <div className="adminPaginationInfo">
                Page {currentPageSafe} of {totalPages}
              </div>
              <div className="adminPaginationActions">
                <button
                  type="button"
                  className="adminPageBtn"
                  onClick={() =>
                    setCurrentPage((page) => Math.max(1, page - 1))
                  }
                  disabled={currentPageSafe <= 1}
                >
                  Prev
                </button>
                <button type="button" className="adminPageBtn isCurrent">
                  {currentPageSafe}
                </button>
                <button
                  type="button"
                  className="adminPageBtn"
                  onClick={() =>
                    setCurrentPage((page) => Math.min(totalPages, page + 1))
                  }
                  disabled={currentPageSafe >= totalPages}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </main>

      {isAddModalOpen && (
        <div className="modalOverlay" onClick={handleCloseAddModal}>
          <div className="modalContent" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <h3 className="modalTitle">Add New Costume</h3>
              <button
                type="button"
                className="modalCloseBtn"
                onClick={handleCloseAddModal}
                disabled={addSubmitting}
              >
                X
              </button>
            </div>

            <form className="modalForm" onSubmit={handleAddSubmit}>
              <label className="modalLabel" htmlFor="costume-name">
                Name
              </label>
              <input
                id="costume-name"
                type="text"
                className="modalInput"
                value={addForm.name}
                onChange={(e) =>
                  setAddForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="e.g. Green Shirt"
                disabled={addSubmitting}
              />

              <label className="modalLabel">ID (Slug - Auto)</label>
              <div className="modalReadOnly">{slugPreview}</div>

              <label className="modalLabel">Gender</label>
              <div className="modalRadioRow">
                <label className="modalRadio">
                  <input
                    type="radio"
                    name="add-gender"
                    value="male"
                    checked={addForm.gender === "male"}
                    onChange={(e) =>
                      setAddForm((prev) => ({ ...prev, gender: e.target.value }))
                    }
                    disabled={addSubmitting}
                  />
                  <span>Male</span>
                </label>
                <label className="modalRadio">
                  <input
                    type="radio"
                    name="add-gender"
                    value="female"
                    checked={addForm.gender === "female"}
                    onChange={(e) =>
                      setAddForm((prev) => ({ ...prev, gender: e.target.value }))
                    }
                    disabled={addSubmitting}
                  />
                  <span>Female</span>
                </label>
              </div>

              <label className="modalLabel">Status</label>
              <label className="modalCheckbox">
                <input
                  type="checkbox"
                  checked={addForm.isActive}
                  onChange={(e) =>
                    setAddForm((prev) => ({ ...prev, isActive: e.target.checked }))
                  }
                  disabled={addSubmitting}
                />
                <span>Active</span>
              </label>

              <label className="modalLabel" htmlFor="costume-video">
                Video File
              </label>
              <input
                id="costume-video"
                type="file"
                className="modalFile"
                accept=".mp4,.mov,.mkv,.webm,video/mp4,video/quicktime,video/webm,video/x-matroska"
                onChange={(e) =>
                  setAddForm((prev) => ({
                    ...prev,
                    video: e.target.files?.[0] || null,
                  }))
                }
                disabled={addSubmitting}
              />

              <label className="modalLabel" htmlFor="costume-thumb">
                Thumbnail File
              </label>
              <input
                id="costume-thumb"
                type="file"
                className="modalFile"
                accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                onChange={(e) =>
                  setAddForm((prev) => ({
                    ...prev,
                    thumbnail: e.target.files?.[0] || null,
                  }))
                }
                disabled={addSubmitting}
              />

              {addError ? <div className="modalErrorText">{addError}</div> : null}

              <div className="modalActions">
                <button
                  type="button"
                  className="modalBtnGhost"
                  onClick={handleCloseAddModal}
                  disabled={addSubmitting}
                >
                  Cancel
                </button>
                <button type="submit" className="modalBtnPrimary" disabled={addSubmitting}>
                  {addSubmitting ? "Saving..." : "Save Costume"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isEditModalOpen && (
        <div className="modalOverlay" onClick={handleCloseEditModal}>
          <div className="modalContent" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <h3 className="modalTitle">Edit Costume</h3>
              <button
                type="button"
                className="modalCloseBtn"
                onClick={handleCloseEditModal}
                disabled={editSubmitting}
              >
                X
              </button>
            </div>

            <form className="modalForm" onSubmit={handleEditSubmit}>
              <label className="modalLabel">Current ID</label>
              <div className="modalReadOnly">{safeText(editForm.id)}</div>

              <label className="modalLabel" htmlFor="edit-costume-name">
                Name
              </label>
              <input
                id="edit-costume-name"
                type="text"
                className="modalInput"
                value={editForm.name}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="e.g. Green Shirt"
                disabled={editSubmitting}
              />

              <label className="modalLabel">ID (Slug - Follow Name)</label>
              <div className="modalReadOnly">{editSlugPreview}</div>

              <label className="modalLabel">Gender</label>
              <div className="modalRadioRow">
                <label className="modalRadio">
                  <input
                    type="radio"
                    name="edit-gender"
                    value="male"
                    checked={editForm.gender === "male"}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, gender: e.target.value }))
                    }
                    disabled={editSubmitting}
                  />
                  <span>Male</span>
                </label>
                <label className="modalRadio">
                  <input
                    type="radio"
                    name="edit-gender"
                    value="female"
                    checked={editForm.gender === "female"}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, gender: e.target.value }))
                    }
                    disabled={editSubmitting}
                  />
                  <span>Female</span>
                </label>
              </div>

              <label className="modalLabel">Status</label>
              <label className="modalCheckbox">
                <input
                  type="checkbox"
                  checked={editForm.isActive}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, isActive: e.target.checked }))
                  }
                  disabled={editSubmitting}
                />
                <span>Active</span>
              </label>

              <label className="modalLabel" htmlFor="edit-costume-video">
                Video File (Optional)
              </label>
              <input
                id="edit-costume-video"
                type="file"
                className="modalFile"
                accept=".mp4,.mov,.mkv,.webm,video/mp4,video/quicktime,video/webm,video/x-matroska"
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    video: e.target.files?.[0] || null,
                  }))
                }
                disabled={editSubmitting}
              />

              <label className="modalLabel" htmlFor="edit-costume-thumb">
                Thumbnail File (Optional)
              </label>
              <input
                id="edit-costume-thumb"
                type="file"
                className="modalFile"
                accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    thumbnail: e.target.files?.[0] || null,
                  }))
                }
                disabled={editSubmitting}
              />

              {editError ? <div className="modalErrorText">{editError}</div> : null}

              <div className="modalActions">
                <button
                  type="button"
                  className="modalBtnGhost"
                  onClick={handleCloseEditModal}
                  disabled={editSubmitting}
                >
                  Cancel
                </button>
                <button type="submit" className="modalBtnPrimary" disabled={editSubmitting}>
                  {editSubmitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteModal.isOpen && (
        <div className="modalOverlay" onClick={handleCloseDeleteModal}>
          <div className="modalContent modalConfirmContent" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <h3 className="modalTitle">Confirm</h3>
              <button
                type="button"
                className="modalCloseBtn"
                onClick={handleCloseDeleteModal}
                disabled={deleteSubmitting}
              >
                X
              </button>
            </div>

            <p className="modalConfirmText">
              Yakin mau delete costume <strong>{deleteModal.name}</strong>?
            </p>

            {deleteError ? <div className="modalErrorText">{deleteError}</div> : null}

            <div className="modalActions">
              <button
                type="button"
                className="modalBtnGhost"
                onClick={handleCloseDeleteModal}
                disabled={deleteSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modalBtnDanger"
                onClick={handleConfirmDelete}
                disabled={deleteSubmitting}
              >
                {deleteSubmitting ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
