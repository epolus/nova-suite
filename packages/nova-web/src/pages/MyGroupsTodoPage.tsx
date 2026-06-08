/* SPDX-License-Identifier: AGPL-3.0-only */
import TodoListPage from './todo/TodoListPage';
import { TODO_SCOPE_GROUP } from './todo/todoConfig';

export default function MyGroupsTodoPage() {
  return <TodoListPage config={TODO_SCOPE_GROUP} />;
}
