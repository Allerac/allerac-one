\pset tuples_only on
\pset format unaligned
\pset fieldsep '|'

WITH schema_objects AS (
    SELECT
        'column' AS kind,
        format(
            '%I.%I.%I|%s|not_null=%s|default=%s|identity=%s|generated=%s',
            namespace.nspname,
            relation.relname,
            attribute.attname,
            pg_catalog.format_type(attribute.atttypid, attribute.atttypmod),
            attribute.attnotnull,
            COALESCE(pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid), ''),
            attribute.attidentity,
            attribute.attgenerated
        ) AS definition
    FROM pg_catalog.pg_attribute attribute
    JOIN pg_catalog.pg_class relation ON relation.oid = attribute.attrelid
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    LEFT JOIN pg_catalog.pg_attrdef default_value
        ON default_value.adrelid = attribute.attrelid
        AND default_value.adnum = attribute.attnum
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped

    UNION ALL

    SELECT
        'constraint',
        format(
            '%I.%I.%I|%s',
            namespace.nspname,
            relation.relname,
            constraint_record.conname,
            pg_catalog.pg_get_constraintdef(constraint_record.oid, true)
        )
    FROM pg_catalog.pg_constraint constraint_record
    JOIN pg_catalog.pg_class relation ON relation.oid = constraint_record.conrelid
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'

    UNION ALL

    SELECT
        'index',
        format(
            '%I.%I|%s',
            namespace.nspname,
            index_relation.relname,
            pg_catalog.pg_get_indexdef(index_relation.oid)
        )
    FROM pg_catalog.pg_class index_relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = index_relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND index_relation.relkind = 'i'

    UNION ALL

    SELECT
        'function',
        format(
            '%I.%I(%s)|%s',
            namespace.nspname,
            procedure.proname,
            pg_catalog.pg_get_function_identity_arguments(procedure.oid),
            md5(pg_catalog.pg_get_functiondef(procedure.oid))
        )
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.prokind IN ('f', 'p')

    UNION ALL

    SELECT
        'aggregate',
        format(
            '%I.%I(%s)|return=%s|transition=%s',
            namespace.nspname,
            procedure.proname,
            pg_catalog.pg_get_function_identity_arguments(procedure.oid),
            pg_catalog.pg_get_function_result(procedure.oid),
            procedure.prosrc
        )
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.prokind = 'a'

    UNION ALL

    SELECT
        'view',
        format(
            '%I.%I|%s',
            namespace.nspname,
            relation.relname,
            md5(pg_catalog.pg_get_viewdef(relation.oid, true))
        )
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('v', 'm')

    UNION ALL

    SELECT
        'trigger',
        format(
            '%I.%I.%I|%s',
            namespace.nspname,
            relation.relname,
            trigger_record.tgname,
            pg_catalog.pg_get_triggerdef(trigger_record.oid, true)
        )
    FROM pg_catalog.pg_trigger trigger_record
    JOIN pg_catalog.pg_class relation ON relation.oid = trigger_record.tgrelid
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND NOT trigger_record.tgisinternal

    UNION ALL

    SELECT
        'sequence',
        format(
            '%I.%I|type=%s|min=%s|max=%s|increment=%s|cycle=%s|cache=%s',
            namespace.nspname,
            relation.relname,
            pg_catalog.format_type(sequence_record.seqtypid, NULL),
            sequence_record.seqmin,
            sequence_record.seqmax,
            sequence_record.seqincrement,
            sequence_record.seqcycle,
            sequence_record.seqcache
        )
    FROM pg_catalog.pg_sequence sequence_record
    JOIN pg_catalog.pg_class relation ON relation.oid = sequence_record.seqrelid
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'

    UNION ALL

    SELECT
        'extension',
        format('%I|%s', extension_record.extname, extension_record.extversion)
    FROM pg_catalog.pg_extension extension_record
)
SELECT kind || '|' || definition
FROM schema_objects
ORDER BY kind, definition;
