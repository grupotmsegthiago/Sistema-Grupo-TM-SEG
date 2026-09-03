type FinancialCategoryClient = {
  from: (table: string) => any;
};

export type DeleteFinancialCategoryResult =
  | { deleted: true; inUseCount: 0 }
  | { deleted: false; inUseCount: number };

/**
 * Exclui somente categorias sem lançamentos vinculados.
 * Categorias em uso são fonte do agrupamento da DRE e não podem ser removidas.
 */
export async function deleteFinancialCategorySafely(
  client: FinancialCategoryClient,
  categoryId: string,
): Promise<DeleteFinancialCategoryResult> {
  const { count, error: usageError } = await client
    .from('financial_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', categoryId);

  if (usageError) throw new Error(usageError.message);

  const inUseCount = Number(count || 0);
  if (inUseCount > 0) return { deleted: false, inUseCount };

  const { error: deleteError } = await client
    .from('financial_categories')
    .delete()
    .eq('id', categoryId);

  if (deleteError) throw new Error(deleteError.message);
  return { deleted: true, inUseCount: 0 };
}
