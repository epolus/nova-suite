/* SPDX-License-Identifier: AGPL-3.0-only */
import TodoListPage from './todo/TodoListPage';
import { TODO_SCOPE_ME } from './todo/todoConfig';

export default function MyTodoPage() {
  return <TodoListPage config={TODO_SCOPE_ME} />;
}
