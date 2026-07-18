function getPagination(filters) {
  const page = parseInt(filters.page) || 1;

  const pageSize = parseInt(filters.pageSize) || 20;

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

module.exports = getPagination;
