import test from 'node:test';
import assert from 'node:assert/strict';
import { compendiumFixture } from './sql/compendium-fixture';

test('compêndio protege publicação, relações, revisões e autoridade global no PostgreSQL', async (t) => {
  const f = await compendiumFixture();
  const { db } = f;
  try {
    await t.test('rascunhos e suas fontes não aparecem na leitura pública', async () => {
      const row = await f.species();
      assert.deepEqual(await f.anonymous('SELECT * FROM public.compendio_revisoes'), []);
      assert.deepEqual(await f.anonymous('SELECT * FROM public.compendio_especies'), []);
      assert.deepEqual(await f.anonymous('SELECT * FROM public.compendio_fontes'), []);
      await f.publish(row.revisionId);
      assert.equal((await f.anonymous('SELECT * FROM public.compendio_especies')).length, 1);
      assert.equal((await f.anonymous('SELECT * FROM public.compendio_fontes')).length, 1);
      assert.equal(
        (await f.anonymous('SELECT * FROM public.compendio_revisoes'))[0].nome_pt,
        'Espécie de teste',
      );
      assert.equal(
        (await f.anonymous('SELECT * FROM public.compendio_registros'))[0].revisao_atual_id,
        row.revisionId,
      );
    });

    await t.test(
      'jogador e mestre não recebem manutenção global; admin pode cadastrar',
      async () => {
        for (const user of [f.player, f.gm]) {
          await assert.rejects(
            f.user(
              user,
              `INSERT INTO public.compendio_registros(tipo,slug)
          VALUES('especie','sem-permissao')`,
            ),
            { code: '42501' },
          );
          await assert.rejects(
            f.user(user, 'SELECT * FROM public.publicar_compendio($1)', [crypto.randomUUID()]),
            { code: 'WC002' },
          );
        }
        const rows = await f.user(
          f.admin,
          `INSERT INTO public.compendio_registros(tipo,slug)
        VALUES('especie','cadastro-admin') RETURNING id`,
        );
        assert.equal(rows.length, 1);
        assert.deepEqual(
          await f.anonymous(`SELECT * FROM public.compendio_registros WHERE slug='cadastro-admin'`),
          [],
        );
      },
    );

    await t.test(
      'banco recusa entidade incompatível, parentesco inexistente e nível fora da faixa',
      async () => {
        const row = await f.draft();
        await assert.rejects(
          db.query('INSERT INTO public.compendio_classes(revisao_id,dado_vida) VALUES($1,8)', [
            row.revisionId,
          ]),
          { code: 'WC001' },
        );
        const lineage = await f.draft('linhagem');
        await assert.rejects(
          db.query(
            'INSERT INTO public.compendio_linhagens(revisao_id,especie_revisao_id) VALUES($1,$2)',
            [lineage.revisionId, crypto.randomUUID()],
          ),
          { code: '23503' },
        );
        const cls = await f.draft('classe');
        await db.query('INSERT INTO public.compendio_classes(revisao_id,dado_vida) VALUES($1,8)', [
          cls.revisionId,
        ]);
        await assert.rejects(
          db.query('INSERT INTO public.compendio_classe_niveis(revisao_id,nivel) VALUES($1,21)', [
            cls.revisionId,
          ]),
          { code: '23514' },
        );
      },
    );

    await t.test(
      'publicação exige domínio, escolhas viáveis e ausência de pendências obrigatórias',
      async () => {
        const missing = await f.draft();
        await assert.rejects(f.publish(missing.revisionId), { code: 'WC001' });
        const row = await f.species('Espécie com escolha');
        await db.query(
          `INSERT INTO public.compendio_grupos_escolha(revisao_id,chave,nome_pt,minimo,maximo)
        VALUES($1,'origem','Escolha de origem',1,1)`,
          [row.revisionId],
        );
        await assert.rejects(f.publish(row.revisionId), { code: 'WC001' });
        await db.query('DELETE FROM public.compendio_grupos_escolha WHERE revisao_id=$1', [
          row.revisionId,
        ]);
        await db.query(
          `INSERT INTO public.compendio_pendencias(revisao_id,codigo,mensagem,severidade)
        VALUES($1,'UNRESOLVED_REFERENCE','Talento não resolvido','error')`,
          [row.revisionId],
        );
        await assert.rejects(f.publish(row.revisionId), { code: 'WC001' });
        await db.query(
          'UPDATE public.compendio_pendencias SET resolvida=true WHERE revisao_id=$1',
          [row.revisionId],
        );
        await f.publish(row.revisionId);
      },
    );

    await t.test('revisão publicada e seus dados mecânicos são imutáveis', async () => {
      const row = await f.species('Espécie imutável');
      await f.publish(row.revisionId);
      await assert.rejects(
        db.query(`UPDATE public.compendio_revisoes SET descricao_pt='Alteração' WHERE id=$1`, [
          row.revisionId,
        ]),
        { code: 'WC003' },
      );
      await assert.rejects(
        db.query('UPDATE public.compendio_deslocamentos SET distancia=12 WHERE revisao_id=$1', [
          row.revisionId,
        ]),
        { code: 'WC003' },
      );
      await assert.rejects(
        db.query(
          `INSERT INTO public.compendio_deslocamentos(revisao_id,modo,distancia,unidade)
        VALUES($1,'voo',9,'metros')`,
          [row.revisionId],
        ),
        { code: 'WC003' },
      );
      await assert.rejects(
        db.query('DELETE FROM public.compendio_revisoes WHERE id=$1', [row.revisionId]),
        { code: 'WC003' },
      );
      await db.query(
        `INSERT INTO public.compendio_revisoes
        (registro_id,numero,conjunto_regras_codigo,fonte_id,nome_pt,descricao_pt)
        VALUES($1,2,'dnd-5e-2024',$2,'Nova revisão','Descrição revisada')`,
        [row.recordId, f.sourceId],
      );
      assert.equal(
        (
          await f.anonymous('SELECT * FROM public.compendio_revisoes WHERE registro_id=$1', [
            row.recordId,
          ])
        ).length,
        1,
      );
    });

    await t.test('fórmula tipada admite atributos e recusa conteúdo executável', async () => {
      const row = await f.species('Espécie com defesa');
      const good = {
        op: 'add',
        args: [
          { op: 'constant', value: 13 },
          { op: 'ability_modifier', ability: 'con' },
        ],
      };
      await db.query(
        `INSERT INTO public.compendio_efeitos(revisao_id,chave,tipo,formula)
        VALUES($1,'defesa','ca_formula',$2)`,
        [row.revisionId, good],
      );
      await assert.rejects(
        db.query(
          `INSERT INTO public.compendio_efeitos(revisao_id,chave,tipo,formula)
        VALUES($1,'invalido','ca_formula',$2)`,
          [row.revisionId, { op: 'eval', source: 'process.exit()' }],
        ),
        { code: '23514' },
      );
    });

    await t.test('fórmula incompleta não escapa do CHECK como valor SQL nulo', async () => {
      const row = await f.species('Fórmula incompleta');
      for (const formula of [
        { op: 'ability_modifier', ability: null },
        { op: 'add', args: [{ op: 'ability_modifier', ability: null }] },
      ]) {
        await assert.rejects(
          db.query(
            `INSERT INTO public.compendio_efeitos(revisao_id,chave,tipo,formula)
          VALUES($1,$2,'ca_formula',$3)`,
            [row.revisionId, crypto.randomUUID(), formula],
          ),
          { code: '23514' },
        );
      }
    });

    await t.test('procedência usada por revisão publicada não pode ser reescrita', async () => {
      await assert.rejects(
        db.query(`UPDATE public.compendio_fontes SET titulo='Fonte alterada' WHERE id=$1`, [
          f.sourceId,
        ]),
        { code: 'WC003' },
      );
    });

    await t.test(
      'classe e lista de magia publicam juntas sem referências públicas para rascunhos',
      async () => {
        const cls = await f.draft('classe', 'Classe com magia');
        await db.query('INSERT INTO public.compendio_classes(revisao_id,dado_vida) VALUES($1,6)', [
          cls.revisionId,
        ]);
        const spell = await f.draft('magia', 'Magia da classe');
        await db.query(
          `INSERT INTO public.compendio_magias(revisao_id,circulo,escola) VALUES($1,1,'Evocação')`,
          [spell.revisionId],
        );
        await db.query(
          `INSERT INTO public.compendio_magia_classes(revisao_id,classe_revisao_id) VALUES($1,$2)`,
          [spell.revisionId, cls.revisionId],
        );
        await db.query(
          `INSERT INTO public.compendio_concessoes(revisao_id,chave,tipo,alvo_revisao_id)
        VALUES($1,'magia','magia',$2)`,
          [cls.revisionId, spell.revisionId],
        );
        await assert.rejects(f.publish(cls.revisionId), { code: 'WC001' });
        const result = await f.user(f.admin, 'SELECT * FROM public.publicar_compendio_lote($1)', [
          [cls.revisionId, spell.revisionId],
        ]);
        assert.equal(result.length, 2);
        assert.ok(result.every((r) => r.estado === 'publicado'));
        assert.equal(
          (
            await f.anonymous('SELECT * FROM public.compendio_magia_classes WHERE revisao_id=$1', [
              spell.revisionId,
            ])
          ).length,
          1,
        );
        assert.equal(
          (
            await f.user(f.admin, 'SELECT * FROM public.publicar_compendio_lote($1)', [
              [cls.revisionId, spell.revisionId],
            ])
          ).length,
          2,
        );
      },
    );
  } finally {
    await db.close();
  }
});
